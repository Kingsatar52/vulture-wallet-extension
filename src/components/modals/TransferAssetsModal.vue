<template>
    <div class="flexBox" style="height: 100%; width: 100%;">
        <div class="flexBox" style="flex-grow: 1; padding-left: 15px; padding-right: 15px; width: 100%;
        flex-direction: column; align-items: center; margin-top: 30px; box-sizing: border-box; font-size: 20px;
        overflow-wrap: break-word;">
            
            <div style="width: 100%; text-align: center; margin-bottom: 0px; margin-top: 0px;  font-size: 24px;">
                Transfer Assets<br>
                <hr>
            </div>

            <div style="width: 100%; text-align: left; margin-top: 20px;">
                Recipent: <span style="color: var(--accent_color); font-size: 15px;">{{recipentAddress}}</span> <br>
                <hr>
            </div>

            <div style="width: 100%; text-align: left; margin-top: 20px;">
                Assets: <span style="color: var(--accent_color)">{{amountToSend}} <span style="font-size: 13px;">{{asset}} </span></span> <br>
            </div>

            <div style="width: 100%; text-align: left; margin-bottom: 20px;margin-top: 5px;">
                Tx Fee: <span style="color: var(--accent_color)">{{txFee.toFixed(8)}} <span style="font-size: 13px;">{{asset}} </span></span> <br>
                <hr>
            </div>

            <div v-bind:class="currentTxState != txStates.NONE ? 'show' : 'hide' " class="txState"  style="width: 95%; text-align: left;">
                State:
                <span v-if="currentTxState == txStates.SENDING" style="color: var(--accent_color)">Sending <br></span>
                <span v-if="currentTxState == txStates.PENDING" style="color: var(--accent_color)">Pending <br></span>
                <span v-if="currentTxState == txStates.SUCCESS" style="color: #4dff97">Success <br></span>
                <span v-if="currentTxState == txStates.FAILED" style="color: #ff0061">Failed <br></span>
                Completed In: <span style="color: var(--accent_color)">{{txTimer.toFixed(2)}}s <br></span>
                <hr>
                <div v-bind:class="currentTxState == txStates.SUCCESS ? 'show' : 'hide' " style="font-size: 16px;">
                Block ID: <span style="color: var(--accent_color); font-size: 15px;">{{blockHash}}</span> <br>
                </div>
            </div>

        </div>
        <div class="flexBox" style="flex-grow: 0; margin-bottom: 15px; width: 100%; flex-direction: row; align-self: center; justify-content: space-evenly;">
            <DefaultButton buttonHeight="40px" buttonWidth="150px" buttonText="Return" @button-click="quitModal()"/>
            <DefaultButton  v-if="currentTxState == txStates.NONE" buttonHeight="40px" buttonWidth="150px" buttonText="Send" @button-click="send()"/>
        </div>
    </div>
</template>

<script lang="ts">
import DefaultButton from "../building_parts/DefaultButton.vue";
import DefaultInput from "../building_parts/DefaultInput.vue";
import DropdownSelection from "../building_parts/DropdownSelection.vue";
import AccountModule from "../AccountModule.vue"

import { VultureWallet, createNewAccount, WalletType, DefaultNetworks, Network, NetworkType} from "../../vulture_backend/wallets/IvultureWallet";
import { PropType, reactive, ref } from 'vue';
import { VultureMessage } from '@/vulture_backend/vultureMessage';
import { TxState } from '@/uiTypes';

export default {
  name: "TransferAssetsModal",
  components: {
    DropdownSelection,
    AccountModule,
    DefaultButton,
    DefaultInput,
  },
  props: {
    vultureWallet: {
        type: Object as PropType<VultureWallet>,
        required: true,
    },
    recipentAddress: String,
    amountToSend: String,
  },
  setup(props: any, context: any) {

    let currentTxState = ref(TxState.NONE);
    let blockHash = ref('');
    let txTimer = ref(0);
    let txStates = TxState;

    let accountName: string;
    const networks = new DefaultNetworks();

    let asset = ref('');
    asset.value = (props.vultureWallet as VultureWallet).accountStore.currentlySelectedNetwork.networkAssetPrefix;

    let accountAmount = ref(0);
    accountAmount.value = (props.vultureWallet as VultureWallet).accountStore.allAccounts.length;
    let selectedNetwork = reactive({network: networks.AlephZero});

    let txFee = ref(0);

    function quitModal() {
        currentTxState.value = TxState.NONE;
        context.emit("quit-modal");
    }

    function send() {
        currentTxState.value = TxState.SENDING;
        let timer = setInterval(async () => {
            txTimer.value += 0.01;
        }, 10);
        (props.vultureWallet as VultureWallet).currentWallet.accountEvents.removeAllListeners(VultureMessage.TRANSFER_ASSETS);
        (props.vultureWallet as VultureWallet).currentWallet.accountEvents.on(VultureMessage.TRANSFER_ASSETS, (params) => {
            if(params.status == false) {
                (props.vultureWallet as VultureWallet).currentWallet.updateAccountState();
                currentTxState.value = TxState.FAILED;
                clearInterval(timer);
            } else if(params.status == 'InBlock') {
                if(params.method == 'ExtrinsicSuccess') {
                    (props.vultureWallet as VultureWallet).currentWallet.updateAccountState();
                    currentTxState.value = TxState.SUCCESS;
                    blockHash.value = params.blockHash;
                    clearInterval(timer);
                }else {
                    (props.vultureWallet as VultureWallet).currentWallet.updateAccountState();
                    currentTxState.value = TxState.FAILED;
                    clearInterval(timer);
                }
            }
            if(params.status == 'Ready') {
                currentTxState.value = TxState.SENDING;
            }
            if(params.status == 'Broadcast') {
                currentTxState.value = TxState.PENDING;
            }
        });

        (props.vultureWallet as VultureWallet).currentWallet.transferAssets(props.recipentAddress, Number(props.amountToSend));
    }
    let estimateFee = () => {
        (props.vultureWallet as VultureWallet).currentWallet.accountEvents.once(VultureMessage.ESTIMATE_TX_FEE, (fee) => {
            txFee.value = fee;
        });
        (props.vultureWallet as VultureWallet).currentWallet.estimateTxFee(props.recipentAddress, Number(props.amountToSend));
    }
    estimateFee();

    return {
        txFee,
        asset,
        txTimer,
        networks,
        txStates,
        blockHash,
        accountAmount,
        currentTxState,
        selectedNetwork,

        quitModal: quitModal,
        send: send
    }
  }
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

hr {
    margin-top: 5px;
    margin-bottom: 5px;
    border: none;
    height: 1px;
    background-color: var(--fg_color_2);
}
.txState {
    border-radius: 12px;
    border-width: 1px;
    border-style: solid;
    border-color: var(--bg_color_2);
    padding: 12px;
    margin: 12px;
    height: 120px;
    overflow: hidden;
}
.vultureLogo {
    fill: var(--bg_color);
    filter: drop-shadow(0px 0px 5px rgb(2,2,2));
}
.styled {
    color: var(--accent_color);
}
.box {
    flex-direction: column;
    background-color: var(--bg_color);
    box-shadow: 0px 0px 7px rgb(7, 7, 7);
    border-width: 2px;
    border-color: var(--bg_color_2);
    border-style: solid;
    border-radius: 24px;
    z-index: 2;
}
</style>
