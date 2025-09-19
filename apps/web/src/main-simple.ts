import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App-simple.vue';
import './assets/styles/main.css';

// Simple routing without complex dependencies
const Dashboard = () => import('./pages/Dashboard-simple.vue');

const routes = [
  { path: '/', name: 'dashboard', component: Dashboard },
  { path: '/claim', name: 'claim', component: Dashboard }, // Reuse for MVP
  { path: '/machines', name: 'machines', component: Dashboard },
  { path: '/staking', name: 'staking', component: Dashboard }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

const app = createApp(App);
app.use(router);
app.mount('#app');
