import { computed } from 'vue';
import { getContract, parseUnits } from 'viem';
import { useWalletStore } from '@/stores/wallet';
import type { ClaimTransaction, StakingTransaction } from '@/types/web3';

// Import contract addresses
import contractAddresses from '@/contracts/addresses.adil.json';

// Contract ABIs (simplified for MVP)
const ClaimProcessorABI = [
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'epochIds', type: 'uint256[]' },
      { name: 'groups', type: 'string[]' }
    ],
    outputs: []
  },
  {
    name: 'paused',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const;

const CHGStakingABI = [
  {
    name: 'stake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'lockDays', type: 'uint256' }
    ],
    outputs: []
  },
  {
    name: 'unstake',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: []
  },
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'positionId', type: 'uint256' }],
    outputs: []
  }
] as const;

const CHGABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

export const useContracts = () => {
  const walletStore = useWalletStore();

  // Contract instances
  const claimProcessor = computed(() => {
    if (!walletStore.walletClient || !walletStore.address) return null;
    
    return getContract({
      address: contractAddresses.contracts.ClaimProcessor.address as `0x${string}`,
      abi: ClaimProcessorABI,
      walletClient: walletStore.walletClient
    });
  });

  const chgStaking = computed(() => {
    if (!walletStore.walletClient || !walletStore.address) return null;
    
    return getContract({
      address: contractAddresses.contracts.CHGStaking.address as `0x${string}`,
      abi: CHGStakingABI,
      walletClient: walletStore.walletClient
    });
  });

  const chgToken = computed(() => {
    if (!walletStore.walletClient || !walletStore.address) return null;
    
    return getContract({
      address: contractAddresses.contracts.CHG.address as `0x${string}`,
      abi: CHGABI,
      walletClient: walletStore.walletClient
    });
  });

  // Contract interaction methods
  const submitClaim = async (claimData: ClaimTransaction): Promise<string> => {
    if (!claimProcessor.value) {
      throw new Error('Wallet not connected or claim processor not available');
    }

    try {
      const hash = await claimProcessor.value.write.claim([
        claimData.epochIds,
        claimData.groups
      ]);
      
      return hash;
    } catch (error: any) {
      throw new Error(`Claim failed: ${error.message}`);
    }
  };

  const submitStake = async (stakingData: StakingTransaction): Promise<string> => {
    if (!chgStaking.value || !chgToken.value) {
      throw new Error('Wallet not connected or staking contracts not available');
    }

    try {
      // First approve CHG tokens
      const amount = parseUnits(stakingData.amount, 18);
      const approveHash = await chgToken.value.write.approve([
        contractAddresses.contracts.CHGStaking.address,
        amount
      ]);
      
      // Wait for approval (simplified - in production, wait for confirmation)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Then stake
      const stakeHash = await chgStaking.value.write.stake([
        amount,
        BigInt(stakingData.lockDays)
      ]);
      
      return stakeHash;
    } catch (error: any) {
      throw new Error(`Staking failed: ${error.message}`);
    }
  };

  const getCHGBalance = async (address: string): Promise<bigint> => {
    if (!chgToken.value) return 0n;
    
    try {
      return await chgToken.value.read.balanceOf([address]);
    } catch (error) {
      console.error('Failed to get CHG balance:', error);
      return 0n;
    }
  };

  const getCHGAllowance = async (owner: string, spender: string): Promise<bigint> => {
    if (!chgToken.value) return 0n;
    
    try {
      return await chgToken.value.read.allowance([owner, spender]);
    } catch (error) {
      console.error('Failed to get CHG allowance:', error);
      return 0n;
    }
  };

  const checkPauseStatus = async (): Promise<boolean> => {
    if (!claimProcessor.value) return false;
    
    try {
      return await claimProcessor.value.read.paused();
    } catch (error) {
      console.error('Failed to check pause status:', error);
      return false;
    }
  };

  return {
    // Contract instances
    claimProcessor,
    chgStaking,
    chgToken,
    
    // Contract methods
    submitClaim,
    submitStake,
    getCHGBalance,
    getCHGAllowance,
    checkPauseStatus,
    
    // Contract addresses
    addresses: contractAddresses.contracts
  };
};

export { apiService };
export default api;
