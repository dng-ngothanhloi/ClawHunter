import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiService } from '@/services/api';
import type { ClaimInfo, RevenueEpoch } from '@/types/api';

export const useClaimsStore = defineStore('claims', () => {
  // State
  const pendingClaims = ref<ClaimInfo[]>([]);
  const claimHistory = ref<ClaimInfo[]>([]);
  const latestEpoch = ref<RevenueEpoch | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const totalClaimable = computed(() => {
    return pendingClaims.value
      .filter(claim => !claim.claimed)
      .reduce((sum, claim) => sum + parseFloat(claim.amount), 0)
      .toString();
  });

  const claimsByGroup = computed(() => {
    const groups = { A: [], B: [], G: [] } as Record<string, ClaimInfo[]>;
    
    pendingClaims.value.forEach(claim => {
      if (groups[claim.group]) {
        groups[claim.group].push(claim);
      }
    });
    
    return groups;
  });

  const totalByGroup = computed(() => {
    return {
      A: claimsByGroup.value.A.reduce((sum, claim) => sum + parseFloat(claim.amount), 0).toString(),
      B: claimsByGroup.value.B.reduce((sum, claim) => sum + parseFloat(claim.amount), 0).toString(),
      G: claimsByGroup.value.G.reduce((sum, claim) => sum + parseFloat(claim.amount), 0).toString()
    };
  });

  const hasUnclaimedRewards = computed(() => {
    return pendingClaims.value.some(claim => !claim.claimed);
  });

  // Actions
  const fetchPendingClaims = async (address: string) => {
    loading.value = true;
    error.value = null;
    
    try {
      const response = await apiService.getClaims(address);
      pendingClaims.value = response.data.claims;
      
      // Also fetch latest epoch for dashboard
      try {
        const epochResponse = await apiService.getLatestEpoch();
        latestEpoch.value = epochResponse.data;
      } catch (epochError) {
        console.warn('Failed to fetch latest epoch:', epochError);
      }
      
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch claims';
      console.error('Failed to fetch pending claims:', err);
    } finally {
      loading.value = false;
    }
  };

  const fetchClaimHistory = async (address: string) => {
    try {
      const response = await apiService.getClaims(address, { claimed: true });
      claimHistory.value = response.data.claims.filter(claim => claim.claimed);
    } catch (err: any) {
      console.error('Failed to fetch claim history:', err);
    }
  };

  const markClaimAsProcessing = (epochId: number, group: string) => {
    const claim = pendingClaims.value.find(
      c => c.epochId === epochId && c.group === group
    );
    if (claim) {
      // Could add a processing state here
      console.log(`Marking claim ${epochId}-${group} as processing`);
    }
  };

  const markClaimAsCompleted = (epochId: number, group: string, txHash: string) => {
    const claimIndex = pendingClaims.value.findIndex(
      c => c.epochId === epochId && c.group === group
    );
    
    if (claimIndex !== -1) {
      const claim = pendingClaims.value[claimIndex];
      claim.claimed = true;
      claim.claimedTx = txHash;
      claim.claimedAt = new Date().toISOString();
      
      // Move to history
      claimHistory.value.unshift(claim);
      
      // Remove from pending
      pendingClaims.value.splice(claimIndex, 1);
    }
  };

  const clearClaims = () => {
    pendingClaims.value = [];
    claimHistory.value = [];
    latestEpoch.value = null;
    error.value = null;
  };

  const refreshClaims = async (address: string) => {
    await Promise.all([
      fetchPendingClaims(address),
      fetchClaimHistory(address)
    ]);
  };

  return {
    // State
    pendingClaims,
    claimHistory,
    latestEpoch,
    loading,
    error,
    
    // Getters
    totalClaimable,
    claimsByGroup,
    totalByGroup,
    hasUnclaimedRewards,
    
    // Actions
    fetchPendingClaims,
    fetchClaimHistory,
    markClaimAsProcessing,
    markClaimAsCompleted,
    clearClaims,
    refreshClaims
  };
});
