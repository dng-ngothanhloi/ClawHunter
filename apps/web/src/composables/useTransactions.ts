import { ref, computed } from 'vue';
import { useWalletStore } from '@/stores/wallet';
import { apiService } from '@/services/api';
import type { TransactionReceipt, TransactionRequest } from 'viem';

// Simple console logger for frontend
const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data),
  error: (msg: string, data?: any) => console.error(`[ERROR] ${msg}`, data),
};

export interface TransactionStatus {
  hash?: string;
  status: 'idle' | 'preparing' | 'pending' | 'confirmed' | 'failed';
  error?: string;
  receipt?: TransactionReceipt;
  gasUsed?: string;
  confirmations?: number;
}

export interface ClaimTransactionData {
  beneficiary: string;
  totalClaimable: string;
  claimCount: number;
  gasEstimate: {
    gasLimit: string;
    gasPrice: string;
    gasCostUSD: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  transactionData: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
    gasPrice: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
  };
  validUntil: string;
}

export const useTransactions = () => {
  const walletStore = useWalletStore();
  
  // Transaction states
  const claimStatus = ref<TransactionStatus>({ status: 'idle' });
  const stakeStatus = ref<TransactionStatus>({ status: 'idle' });
  const unstakeStatus = ref<TransactionStatus>({ status: 'idle' });
  
  // Loading states
  const isClaimPending = computed(() => 
    ['preparing', 'pending'].includes(claimStatus.value.status)
  );
  const isStakePending = computed(() => 
    ['preparing', 'pending'].includes(stakeStatus.value.status)
  );
  const isUnstakePending = computed(() => 
    ['preparing', 'pending'].includes(unstakeStatus.value.status)
  );

  /**
   * Process claim transaction
   */
  const processClaim = async (epochIds: number[], groups?: string[]) => {
    if (!walletStore.isConnected || !walletStore.address) {
      throw new Error('Wallet not connected');
    }

    try {
      claimStatus.value = { status: 'preparing' };

      // 1. Prepare claim transaction via API
      const response = await apiService.prepareClaimTransaction({
        beneficiary: walletStore.address,
        epochIds,
        groups,
      });

      const claimData: ClaimTransactionData = response.data.data;

      // 2. Check if preparation is still valid
      const validUntil = new Date(claimData.validUntil);
      if (new Date() > validUntil) {
        throw new Error('Transaction preparation expired. Please try again.');
      }

      // 3. Execute transaction via wallet
      claimStatus.value = { status: 'pending' };

      const txRequest: TransactionRequest = {
        to: claimData.transactionData.to as `0x${string}`,
        data: claimData.transactionData.data as `0x${string}`,
        value: BigInt(claimData.transactionData.value),
        gas: BigInt(claimData.transactionData.gasLimit),
      };

      // Add EIP-1559 gas pricing if available
      if (claimData.transactionData.maxFeePerGas) {
        txRequest.maxFeePerGas = BigInt(claimData.transactionData.maxFeePerGas);
        txRequest.maxPriorityFeePerGas = BigInt(claimData.transactionData.maxPriorityFeePerGas || '0');
      } else {
        txRequest.gasPrice = BigInt(claimData.transactionData.gasPrice);
      }

      const txHash = await walletStore.sendTransaction(txRequest);
      
      claimStatus.value = { 
        status: 'pending', 
        hash: txHash 
      };

      // 4. Wait for confirmation
      const receipt = await walletStore.waitForTransaction(txHash);
      
      if (receipt.status === 'success') {
        claimStatus.value = {
          status: 'confirmed',
          hash: txHash,
          receipt,
          gasUsed: receipt.gasUsed.toString(),
          confirmations: 1,
        };

        return {
          success: true,
          hash: txHash,
          receipt,
          claimedAmount: claimData.totalClaimable,
          claimCount: claimData.claimCount,
        };
      } else {
        throw new Error('Transaction failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed';
      claimStatus.value = {
        status: 'failed',
        error: errorMessage,
      };
      throw error;
    }
  };

  /**
   * Execute staking transaction
   */
  const executeStake = async (amount: string, lockDuration: number) => {
    if (!walletStore.isConnected || !walletStore.address) {
      throw new Error('Wallet not connected');
    }

    try {
      stakeStatus.value = { status: 'preparing' };

      // 1. Get CHG and CHGStaking contracts
      const chgContract = await walletStore.getContract('CHG');
      const stakingContract = await walletStore.getContract('CHGStaking');

      if (!chgContract || !stakingContract) {
        throw new Error('Contracts not available');
      }

      const amountWei = BigInt(amount) * BigInt(10 ** 18); // Convert to wei

      // 2. Check CHG balance
      const balance = await chgContract.read.balanceOf([walletStore.address]);
      if (balance < amountWei) {
        throw new Error('Insufficient CHG balance');
      }

      // 3. Check and handle CHG approval
      const allowance = await chgContract.read.allowance([
        walletStore.address,
        stakingContract.address,
      ]);

      if (allowance < amountWei) {
        stakeStatus.value = { status: 'pending' };
        
        // Approve CHG tokens
        const approveTxHash = await chgContract.write.approve([
          stakingContract.address,
          amountWei,
        ]);

        // Wait for approval confirmation
        await walletStore.waitForTransaction(approveTxHash);
      }

      // 4. Execute staking transaction
      stakeStatus.value = { status: 'pending' };

      const stakeTxHash = await stakingContract.write.stake([
        amountWei,
        lockDuration,
      ]);

      stakeStatus.value = {
        status: 'pending',
        hash: stakeTxHash,
      };

      // 5. Wait for confirmation
      const receipt = await walletStore.waitForTransaction(stakeTxHash);

      if (receipt.status === 'success') {
        stakeStatus.value = {
          status: 'confirmed',
          hash: stakeTxHash,
          receipt,
          gasUsed: receipt.gasUsed.toString(),
          confirmations: 1,
        };

        return {
          success: true,
          hash: stakeTxHash,
          receipt,
          stakedAmount: amount,
          lockDuration,
        };
      } else {
        throw new Error('Staking transaction failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Staking failed';
      stakeStatus.value = {
        status: 'failed',
        error: errorMessage,
      };
      throw error;
    }
  };

  /**
   * Execute unstaking transaction
   */
  const executeUnstake = async (positionId: string) => {
    if (!walletStore.isConnected || !walletStore.address) {
      throw new Error('Wallet not connected');
    }

    try {
      unstakeStatus.value = { status: 'preparing' };

      // 1. Get CHGStaking contract
      const stakingContract = await walletStore.getContract('CHGStaking');
      if (!stakingContract) {
        throw new Error('Staking contract not available');
      }

      // 2. Check if position can be unstaked (lock period expired)
      const position = await stakingContract.read.stakingPositions([
        walletStore.address,
        positionId,
      ]);

      const currentTime = Math.floor(Date.now() / 1000);
      if (position.lockUntil > currentTime) {
        const unlockDate = new Date(position.lockUntil * 1000);
        throw new Error(`Position is still locked until ${unlockDate.toLocaleDateString()}`);
      }

      // 3. Execute unstaking transaction
      unstakeStatus.value = { status: 'pending' };

      const unstakeTxHash = await stakingContract.write.unstake([positionId]);

      unstakeStatus.value = {
        status: 'pending',
        hash: unstakeTxHash,
      };

      // 4. Wait for confirmation
      const receipt = await walletStore.waitForTransaction(unstakeTxHash);

      if (receipt.status === 'success') {
        unstakeStatus.value = {
          status: 'confirmed',
          hash: unstakeTxHash,
          receipt,
          gasUsed: receipt.gasUsed.toString(),
          confirmations: 1,
        };

        return {
          success: true,
          hash: unstakeTxHash,
          receipt,
          positionId,
        };
      } else {
        throw new Error('Unstaking transaction failed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unstaking failed';
      unstakeStatus.value = {
        status: 'failed',
        error: errorMessage,
      };
      throw error;
    }
  };

  /**
   * Reset transaction status
   */
  const resetClaimStatus = () => {
    claimStatus.value = { status: 'idle' };
  };

  const resetStakeStatus = () => {
    stakeStatus.value = { status: 'idle' };
  };

  const resetUnstakeStatus = () => {
    unstakeStatus.value = { status: 'idle' };
  };

  /**
   * Get transaction status by hash
   */
  const getTransactionStatus = async (hash: string) => {
    if (!walletStore.provider) {
      throw new Error('Provider not available');
    }

    const receipt = await walletStore.provider.getTransactionReceipt(hash);
    const currentBlock = await walletStore.provider.getBlockNumber();
    
    return {
      hash,
      status: receipt ? 'confirmed' : 'pending',
      receipt,
      confirmations: receipt ? currentBlock - receipt.blockNumber : 0,
    };
  };

  return {
    // States
    claimStatus: computed(() => claimStatus.value),
    stakeStatus: computed(() => stakeStatus.value),
    unstakeStatus: computed(() => unstakeStatus.value),
    
    // Loading states
    isClaimPending,
    isStakePending,
    isUnstakePending,
    
    // Actions
    processClaim,
    executeStake,
    executeUnstake,
    
    // Utilities
    resetClaimStatus,
    resetStakeStatus,
    resetUnstakeStatus,
    getTransactionStatus,
  };
};
