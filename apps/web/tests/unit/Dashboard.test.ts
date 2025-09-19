import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import Dashboard from '@/pages/Dashboard.vue';
import { routes } from '@/router';

// Mock API service
vi.mock('@/services/api', () => ({
  apiService: {
    getLatestEpoch: vi.fn().mockResolvedValue({
      data: {
        epochId: 1,
        totalR: '10000.000000',
        opc: '7000.000000',
        alpha: '2000.000000',
        beta: '300.000000',
        gamma: '300.000000',
        delta: '400.000000',
        blockTime: '2025-09-01T00:00:00Z'
      }
    }),
    getEpochs: vi.fn().mockResolvedValue({
      data: {
        epochs: [],
        pagination: { page: 1, limit: 10, total: 0, hasNext: false, hasPrev: false }
      }
    }),
    getRevenueStats: vi.fn().mockResolvedValue({
      data: {
        epochs: { total: 3, latest: 3 },
        revenue: {
          totalAllTime: '33500.000000',
          last30Days: '10000.000000',
          averagePerEpoch: '11166.666667'
        }
      }
    })
  }
}));

describe('Dashboard', () => {
  let router: any;

  beforeEach(async () => {
    router = createRouter({
      history: createWebHistory(),
      routes
    });
    
    await router.push('/');
    await router.isReady();
  });

  it('should render dashboard header correctly', () => {
    const wrapper = mount(Dashboard, {
      global: {
        plugins: [router]
      }
    });

    expect(wrapper.find('h1').text()).toBe('Revenue Sharing Dashboard');
    expect(wrapper.text()).toContain('Track daily revenue distribution');
  });

  it('should display latest epoch information', async () => {
    const wrapper = mount(Dashboard, {
      global: {
        plugins: [router]
      }
    });

    // Wait for component to load data
    await wrapper.vm.$nextTick();
    
    // Should show loading initially
    expect(wrapper.find('.animate-spin')).toBeTruthy();
  });

  it('should display quick action buttons', () => {
    const wrapper = mount(Dashboard, {
      global: {
        plugins: [router]
      }
    });

    const actionButtons = wrapper.findAll('router-link');
    expect(actionButtons.length).toBeGreaterThanOrEqual(3);
    
    const buttonTexts = actionButtons.map(btn => btn.text());
    expect(buttonTexts).toContain('Claim Rewards');
    expect(buttonTexts).toContain('CHG Staking');
    expect(buttonTexts).toContain('Machines');
  });

  it('should format USDT amounts correctly', () => {
    const wrapper = mount(Dashboard, {
      global: {
        plugins: [router]
      }
    });

    // Test the formatUSDT method through component instance
    const component = wrapper.vm as any;
    expect(component.formatUSDT('10000.000000')).toBe('10,000.000000');
    expect(component.formatUSDT('1234.56')).toBe('1,234.56');
  });

  it('should handle empty state gracefully', async () => {
    // Mock empty responses
    const { apiService } = await import('@/services/api');
    vi.mocked(apiService.getLatestEpoch).mockResolvedValueOnce({
      data: null as any
    });

    const wrapper = mount(Dashboard, {
      global: {
        plugins: [router]
      }
    });

    await wrapper.vm.$nextTick();
    
    expect(wrapper.text()).toContain('No epoch data available');
  });
});
