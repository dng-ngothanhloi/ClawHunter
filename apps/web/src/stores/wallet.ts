import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { createWalletClient, custom, formatEther, createPublicClient, http } from 'viem';
import type { WalletState, ChainConfig, TransactionRequest, TransactionReceipt } from '@/types/web3';
import { useAppStore } from './app';

export const useWalletStore = defineStore('wallet', () => {
  // State
  const address = ref<string | null>(null);
  const chainId = ref<number | null>(null);
  const balance = ref<bigint>(0n);
  const isConnecting = ref(false);
  const connector = ref<string | null>(null);
  const walletClient = ref<any>(null);
  const provider = ref<any>(null);

  // Getters
  const isConnected = computed(() => !!address.value && !!chainId.value);
  const formattedAddress = computed(() => {
    if (!address.value) return '';
    return `${address.value.slice(0, 6)}...${address.value.slice(-4)}`;
  });
  const formattedBalance = computed(() => {
    return formatEther(balance.value);
  });

  // Chain configuration
  const targetChain: ChainConfig = {
    id: parseInt(import.meta.env.VITE_CHAIN_ID || '123456'),
    name: import.meta.env.VITE_CHAIN_NAME || 'AdilChain Devnet',
    rpcUrl: import.meta.env.VITE_RPC_URL || 'https://devnet.adilchain-rpc.io',
    explorerUrl: import.meta.env.VITE_EXPLORER_URL || 'https://devnet.adilchain-scan.io',
    nativeCurrency: {
      name: 'ADL',
      symbol: 'ADL',
      decimals: 18
    }
  };

  const isCorrectChain = computed(() => chainId.value === targetChain.id);

  // Actions
  const connect = async () => {
    if (!window.ethereum) {
      const appStore = useAppStore();
      appStore.addNotification({
        type: 'error',
        title: 'Wallet Not Found',
        message: 'Please install MetaMask or another Web3 wallet'
      });
      return;
    }

    isConnecting.value = true;
    
    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      if (accounts.length === 0) {
        throw new Error('No accounts available');
      }

      address.value = accounts[0];
      
      // Get chain ID
      const currentChainId = await window.ethereum.request({
        method: 'eth_chainId'
      });
      chainId.value = parseInt(currentChainId, 16);

      // Create wallet client
      walletClient.value = createWalletClient({
        account: address.value as `0x${string}`,
        transport: custom(window.ethereum)
      });

      // Get balance
      await updateBalance();

      // Check if on correct chain
      if (!isCorrectChain.value) {
        await switchToTargetChain();
      }

      connector.value = 'injected';
      
      // Save connection state
      localStorage.setItem('wallet-connected', 'true');
      localStorage.setItem('wallet-address', address.value);

      const appStore = useAppStore();
      appStore.addNotification({
        type: 'success',
        title: 'Wallet Connected',
        message: `Connected to ${formattedAddress.value}`
      });

    } catch (error: any) {
      const appStore = useAppStore();
      appStore.addNotification({
        type: 'error',
        title: 'Connection Failed',
        message: error.message || 'Failed to connect wallet'
      });
      
      await disconnect();
    } finally {
      isConnecting.value = false;
    }
  };

  const disconnect = async () => {
    address.value = null;
    chainId.value = null;
    balance.value = 0n;
    connector.value = null;
    walletClient.value = null;
    
    // Clear stored connection
    localStorage.removeItem('wallet-connected');
    localStorage.removeItem('wallet-address');

    const appStore = useAppStore();
    appStore.addNotification({
      type: 'info',
      title: 'Wallet Disconnected',
      message: 'Your wallet has been disconnected'
    });
  };

  const switchToTargetChain = async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChain.id.toString(16)}` }]
      });
    } catch (error: any) {
      // Chain not added, try to add it
      if (error.code === 4902) {
        await addTargetChain();
      } else {
        throw error;
      }
    }
  };

  const addTargetChain = async () => {
    if (!window.ethereum) return;

    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: `0x${targetChain.id.toString(16)}`,
        chainName: targetChain.name,
        rpcUrls: [targetChain.rpcUrl],
        blockExplorerUrls: [targetChain.explorerUrl],
        nativeCurrency: targetChain.nativeCurrency
      }]
    });
  };

  const updateBalance = async () => {
    if (!address.value || !window.ethereum) return;

    try {
      const balanceHex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address.value, 'latest']
      });
      balance.value = BigInt(balanceHex);
    } catch (error) {
      console.error('Failed to update balance:', error);
    }
  };

  const tryReconnect = async () => {
    const wasConnected = localStorage.getItem('wallet-connected');
    const savedAddress = localStorage.getItem('wallet-address');
    
    if (wasConnected && savedAddress && window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_accounts'
        });
        
        if (accounts.includes(savedAddress)) {
          address.value = savedAddress;
          
          const currentChainId = await window.ethereum.request({
            method: 'eth_chainId'
          });
          chainId.value = parseInt(currentChainId, 16);

          walletClient.value = createWalletClient({
            account: address.value as `0x${string}`,
            transport: custom(window.ethereum)
          });

          await updateBalance();
          connector.value = 'injected';
        }
      } catch (error) {
        console.warn('Failed to reconnect wallet:', error);
        await disconnect();
      }
    }
  };

  // Listen for account changes
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0] !== address.value) {
        address.value = accounts[0];
        updateBalance();
      }
    });

    window.ethereum.on('chainChanged', (newChainId: string) => {
      chainId.value = parseInt(newChainId, 16);
      if (!isCorrectChain.value) {
        const appStore = useAppStore();
        appStore.addNotification({
          type: 'warning',
          title: 'Wrong Network',
          message: `Please switch to ${targetChain.name}`
        });
      }
    });
  }

  /**
   * Send transaction via connected wallet
   */
  const sendTransaction = async (txRequest: any): Promise<string> => {
    if (!walletClient.value) {
      throw new Error('Wallet not connected');
    }

    try {
      const hash = await walletClient.value.sendTransaction(txRequest);
      logger.info('Transaction sent:', { hash, to: txRequest.to });
      return hash;
    } catch (error) {
      logger.error('Failed to send transaction:', error);
      throw error;
    }
  };

  /**
   * Wait for transaction confirmation
   */
  const waitForTransaction = async (hash: string): Promise<any> => {
    if (!provider.value) {
      // Create public client for reading transaction receipts
      const publicClient = createPublicClient({
        transport: http(targetChain.rpcUrl)
      });
      
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` });
      return receipt;
    }

    try {
      const receipt = await provider.value.waitForTransactionReceipt({ hash });
      logger.info('Transaction confirmed:', { 
        hash, 
        status: receipt.status,
        gasUsed: receipt.gasUsed?.toString() 
      });
      return receipt;
    } catch (error) {
      logger.error('Failed to wait for transaction:', error);
      throw error;
    }
  };

  /**
   * Get contract instance for interaction
   */
  const getContract = async (contractName: string) => {
    if (!walletClient.value) {
      throw new Error('Wallet not connected');
    }

    try {
      // Load contract addresses and ABIs
      const addressesResponse = await fetch('/contracts/addresses.adil.json');
      const addresses = await addressesResponse.json();
      
      const contractInfo = addresses.contracts[contractName];
      if (!contractInfo) {
        throw new Error(`Contract ${contractName} not found in addresses`);
      }

      // Load ABI
      const abiResponse = await fetch(`/contracts/${contractInfo.abi}`);
      const abi = await abiResponse.json();

      return {
        address: contractInfo.address,
        abi,
        // Simplified contract interface for basic read/write operations
        async read(method: string, args: any[] = []) {
          const publicClient = createPublicClient({
            transport: http(targetChain.rpcUrl)
          });
          
          return await publicClient.readContract({
            address: contractInfo.address as `0x${string}`,
            abi,
            functionName: method,
            args,
          });
        },
        
        async write(method: string, args: any[] = []) {
          return await walletClient.value.writeContract({
            address: contractInfo.address as `0x${string}`,
            abi,
            functionName: method,
            args,
          });
        }
      };
    } catch (error) {
      logger.error(`Failed to get contract ${contractName}:`, error);
      throw error;
    }
  };

  return {
    // State
    address,
    chainId,
    balance,
    isConnecting,
    connector,
    walletClient,
    
    // Getters
    isConnected,
    formattedAddress,
    formattedBalance,
    isCorrectChain,
    targetChain,
    
    // Actions
    connect,
    disconnect,
    switchToTargetChain,
    updateBalance,
    tryReconnect,
    sendTransaction,
    waitForTransaction,
    getContract
  };
});
