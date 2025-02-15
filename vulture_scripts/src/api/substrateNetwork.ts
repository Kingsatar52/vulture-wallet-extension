
//import { VultureMessage } from "../../src/vulture_backend/vultureMessage";
//import { VultureRequest } from "../../src/vulture_backend/vultureRPC";

import { cryptoWaitReady } from '@polkadot/util-crypto';

import { WsProvider, Keyring, ApiPromise } from '@polkadot/api';

import { decodeAddress, encodeAddress } from "@polkadot/keyring";
import { hexToU8a, isHex } from "@polkadot/util";
import { KeyringPair } from '@polkadot/keyring/types';

import { VultureNetwork, MethodResponse } from './networkApi';
import { VultureMessage } from '../../../src/vulture_backend/vultureMessage';
import { AccountData, Network } from '../../../src/vulture_backend/wallets/IvultureWallet';


export class SubstrateNetwork implements VultureNetwork {
    currentAddress: string = "";

    keyring?: Keyring;
    keypair?: KeyringPair;

    wsProvider?: WsProvider;
    networkAPI?: ApiPromise;

    seed: string;
    networkURI: string;

    isCryptoReady: boolean = false;
    addressFormat: string | null = null;

    /** ## SubstrateNetwork()
     * Derivation path format is:
     * 
     * `//hardIndex/softIndex`
     * 
     * For Vulture, please only use Hardened keys.
     */
    constructor(seed: string, derivationPath: string, websocketNetworkURI: string, addressFormat?: string) {
        this.seed = seed;
        this.networkURI = websocketNetworkURI;
        this.addressFormat = addressFormat ? addressFormat : null;
        cryptoWaitReady().then((ready) => {
            console.log("Crypto WASM: " + ready);
            this.isCryptoReady = true;

            this.keyring = new Keyring({
                type: 'sr25519',
                ss58Format: this.addressFormat != null ? Number(this.addressFormat) : undefined
            });
            this.keypair = this.keyring.addFromUri(this.seed + derivationPath);
            this.currentAddress = this.keypair.address;
            
            this.wsProvider = new WsProvider(this.networkURI);
            this.wsProvider.isReady.then((ready: any) => {
                ApiPromise.create({provider: this.wsProvider}).then((api) => {
                    this.networkAPI = api;

                    postMessage(new MethodResponse(
                        VultureMessage.SET_CURRENT_WALLET,
                        {
                            success: true,
                            address: this.currentAddress
                        },
                    ));
                });
            });

        }).catch((error) => {
            console.error(error);
        });
        
    }
    updateAccountsToNetwork(accounts: AccountData[], network: Network): void {
        if(this.isCryptoReady) {
            let updatedAccounts: AccountData[];
            updatedAccounts = accounts;
            for(let i = 0; i < accounts.length; i++) {
                if(network.addressFormat != undefined) {
                    this.keyring!.setSS58Format(Number(network.addressFormat));
                }else {
                    this.keyring!.setSS58Format(42);
                }
                let kp = this.keyring!.addFromUri(this.seed + "//" + updatedAccounts[i].accountIndex);
                updatedAccounts[i].address = kp.address;
            }
            postMessage(new MethodResponse(
                VultureMessage.UPDATE_ACCOUNTS_TO_NETWORK,
                {
                    success: true,
                    updatedAccounts: updatedAccounts,
                }
            ));
        }
    }
    getAddress(): MethodResponse {
        throw new Error('Method not implemented.');
    }
    generateAddress(derivationPath: string, accountIndex: number) {
        if(this.isCryptoReady){
            let kp = this.keyring!.addFromUri(this.seed + derivationPath);
            postMessage(new MethodResponse(
                VultureMessage.GET_ADDRESS_FROM_URI,
                {
                    success: true,
                    address: kp.address,
                    accountIndex: accountIndex,
                }
            ));
        }else{
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
    transferAssets(recipent: string, amount: string) {
        if(this.isCryptoReady) {

            this.networkAPI!.tx.balances.transferKeepAlive(recipent, amount).signAndSend(this.keypair!, ({events = [], status}) => {
                if(status.isInBlock) {

                    events.forEach(({event: {data, method, section}, phase}) => {
                        if(method == 'ExtrinsicSuccess') {
                            postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                                success: true,
                                status: status.type,
                                blockHash: status.asInBlock.toHex(),
                                method: method,
                            }});
                        } else if(method == 'ExtrinsicFailed') {                            
                            postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                                success: false,
                                status: status.type,
                                blockHash: status.asInBlock.toHex(),
                                method: method,
                            }});
                        }
                    });
                }else if(status.isDropped) {
                    postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                        success: false,
                        status: status.type,
                    }});
                }else if(status.isFinalityTimeout) {
                    postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                        success: false,
                        status: status.type,
                    }});
                }else if(status.isInvalid) {
                    postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                        success: false,
                        status: status.type,
                    }});
                }
            });
            
        }else {
            postMessage({method: VultureMessage.TRANSFER_ASSETS, params: {
                success: false,
            }});
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
    estimateTxFee(recipent: string, amount: string) {
        if(this.isCryptoReady) {
            this.networkAPI!.tx.balances.transferKeepAlive(recipent, amount).paymentInfo(this.keypair!).then((info: any) => {
                postMessage({method: VultureMessage.ESTIMATE_TX_FEE, params: {
                    success: true,
                    result: info.toJSON(),
                    fee: info.partialFee.toHuman()
                }});
            });
        }else {
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
    validateAddress(address: string) {
        if(this.isCryptoReady) {
            let result = false;
            try {
                encodeAddress(
                    isHex(address)
                        ? hexToU8a(address)
                        : decodeAddress(address)
                );
                result = true;
            }catch(error) {
                result = false;
            }
            postMessage({method: VultureMessage.IS_ADDRESS_VALID, params: {
                success: true,
                isValid: result,
            }});
        }else {
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
    getAddressState() {
        if(this.isCryptoReady) {
            this.networkAPI!.query.system.account(this.currentAddress).then((result) => {
                postMessage({method: VultureMessage.GET_ACCOUNT_STATE, params: {
                    success: true,
                    result: result.toJSON(),
                }});
            });
        }else {
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
    subscribeToAddressUpdates() {
        if(this.isCryptoReady) {
            this.networkAPI!.query.system.account(this.currentAddress, (result: any) => {
                postMessage({method: VultureMessage.SUB_TO_ACCOUNT_STATE, params: {
                    success: true,
                    result: result.toJSON(),
                }});
            });
        }else {
            throw new Error("Cryptography WASM hasn't been initialized yet!");
        }
    }
}

