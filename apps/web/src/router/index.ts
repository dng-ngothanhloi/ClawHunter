import type { RouteRecordRaw } from 'vue-router';

// Lazy-loaded components for code splitting
const Dashboard = () => import('@/pages/Dashboard.vue');
const ClaimCenter = () => import('@/pages/ClaimCenter.vue');
const Machines = () => import('@/pages/Machines.vue');
const MachineDetail = () => import('@/pages/MachineDetail.vue');
const Staking = () => import('@/pages/Staking.vue');
const Owners = () => import('@/pages/Owners.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: Dashboard,
    meta: {
      title: 'Dashboard',
      description: 'Revenue sharing dashboard and latest epoch data'
    }
  },
  {
    path: '/claim',
    name: 'claim',
    component: ClaimCenter,
    meta: {
      title: 'Claim Rewards',
      description: 'Claim your accumulated rewards from all pools',
      requiresWallet: true
    }
  },
  {
    path: '/machines',
    name: 'machines',
    component: Machines,
    meta: {
      title: 'Machines',
      description: 'Claw machine revenue and performance data'
    }
  },
  {
    path: '/machines/:id',
    name: 'machine-detail',
    component: MachineDetail,
    props: true,
    meta: {
      title: 'Machine Detail',
      description: 'Detailed machine revenue and ownership information'
    }
  },
  {
    path: '/staking',
    name: 'staking',
    component: Staking,
    meta: {
      title: 'CHG Staking',
      description: 'Stake CHG tokens and view your staking positions',
      requiresWallet: true
    }
  },
  {
    path: '/owners',
    name: 'owners',
    component: Owners,
    meta: {
      title: 'NFT Ownership',
      description: 'Manage your NFTOwner tokens and machine shares',
      requiresWallet: true
    }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    redirect: '/'
  }
];
