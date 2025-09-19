import express from 'express';
import { param, query } from 'express-validator';
import { asyncHandler, validationMiddleware } from '../middleware/index.js';
import { db } from '../config/database.js';
import logger from '../config/logger.js';

const router: any = express.Router();

/**
 * GET /staking/:addr/positions
 * Get CHG staking positions and reward weights for an address
 */
router.get('/:addr/positions',
  [
    param('addr')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Address must be a valid Ethereum address'),
    query('epoch')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Epoch must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const address = req.params.addr.toLowerCase();
    const epochId = req.query.epoch ? BigInt(req.query.epoch as string) : undefined;

    logger.debug(`Fetching staking positions for ${address}`, {
      epochId: epochId?.toString(),
    });

    // Get target epoch
    let targetEpochId = epochId;
    if (!targetEpochId) {
      const latestEpoch = await db.revenueEpoch.findFirst({
        orderBy: { epochId: 'desc' },
        select: { epochId: true },
      });
      
      if (!latestEpoch) {
        return res.status(404).json({
          error: 'No revenue epochs found',
        });
      }
      
      targetEpochId = latestEpoch.epochId;
    }

    const position = await db.stakingSnapshot.findUnique({
      where: {
        epochId_account: {
          epochId: targetEpochId,
          account: address,
        },
      },
    });

    if (!position) {
      return res.status(404).json({
        error: 'No staking position found for address',
        address,
        epochId: targetEpochId.toString(),
      });
    }

    // Calculate lock duration details
    const lockDurationDays = position.lockUntil 
      ? Math.ceil((position.lockUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 0;

    // Map weight to lock duration (reverse lookup)
    const weightToLockDuration = {
      1000: '30 days',
      1500: '90 days', 
      2000: '180 days',
      3000: '365 days',
    };

    const response = {
      address,
      epochId: targetEpochId.toString(),
      positions: [{
        amount: position.amount.toString(),
        weight: position.weight,
        effectiveWeight: position.effectiveWeight.toString(),
        lockDuration: weightToLockDuration[position.weight as keyof typeof weightToLockDuration] || 'Unknown',
        lockUntil: position.lockUntil?.toISOString() || null,
        lockDaysRemaining: Math.max(0, lockDurationDays),
        isLocked: lockDurationDays > 0,
        snapshotTime: position.createdAt.toISOString(),
      }],
      totalEffectiveWeight: position.effectiveWeight.toString(),
      summary: {
        totalStaked: position.amount.toString(),
        weightMultiplier: (position.weight / 1000).toFixed(1) + 'x',
        rewardEligible: true,
      },
    };

    logger.info(`Retrieved staking position for ${address} in epoch ${targetEpochId}`);
    res.json(response);
  })
);

/**
 * GET /staking/:addr/history
 * Get historical staking positions across epochs
 */
router.get('/:addr/history',
  [
    param('addr')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Address must be a valid Ethereum address'),
    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From epoch must be a non-negative integer'),
    query('to')
      .optional()
      .isInt({ min: 0 })
      .withMessage('To epoch must be a non-negative integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const address = req.params.addr.toLowerCase();
    const from = req.query.from ? BigInt(req.query.from as string) : undefined;
    const to = req.query.to ? BigInt(req.query.to as string) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;

    logger.debug(`Fetching staking history for ${address}`, {
      from: from?.toString(),
      to: to?.toString(),
      limit,
    });

    // Build where clause
    const where: any = { account: address };
    if (from !== undefined && to !== undefined) {
      where.epochId = {
        gte: from,
        lte: to,
      };
    } else if (from !== undefined) {
      where.epochId = { gte: from };
    } else if (to !== undefined) {
      where.epochId = { lte: to };
    }

    const positions = await db.stakingSnapshot.findMany({
      where,
      orderBy: { epochId: 'desc' },
      take: limit,
    });

    if (positions.length === 0) {
      return res.status(404).json({
        error: 'No staking history found for address',
        address,
      });
    }

    // Map weight to lock duration
    const weightToLockDuration = {
      1000: '30 days',
      1500: '90 days', 
      2000: '180 days',
      3000: '365 days',
    };

    const response = {
      address,
      history: positions.map(position => {
        const lockDurationDays = position.lockUntil 
          ? Math.ceil((position.lockUntil.getTime() - position.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        return {
          epochId: position.epochId.toString(),
          amount: position.amount.toString(),
          weight: position.weight,
          effectiveWeight: position.effectiveWeight.toString(),
          lockDuration: weightToLockDuration[position.weight as keyof typeof weightToLockDuration] || 'Unknown',
          lockUntil: position.lockUntil?.toISOString() || null,
          lockDaysAtSnapshot: Math.max(0, lockDurationDays),
          weightMultiplier: (position.weight / 1000).toFixed(1) + 'x',
          snapshotTime: position.createdAt.toISOString(),
        };
      }),
      totalEpochs: positions.length,
    };

    logger.info(`Retrieved staking history for ${address} across ${positions.length} epochs`);
    res.json(response);
  })
);

/**
 * GET /staking/stats
 * Get overall staking statistics
 */
router.get('/stats',
  [
    query('epoch')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Epoch must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const epochId = req.query.epoch ? BigInt(req.query.epoch as string) : undefined;

    logger.debug('Fetching staking statistics', {
      epochId: epochId?.toString(),
    });

    // Get target epoch
    let targetEpochId = epochId;
    if (!targetEpochId) {
      const latestEpoch = await db.revenueEpoch.findFirst({
        orderBy: { epochId: 'desc' },
        select: { epochId: true },
      });
      
      if (!latestEpoch) {
        return res.status(404).json({
          error: 'No revenue epochs found',
        });
      }
      
      targetEpochId = latestEpoch.epochId;
    }

    const [stakingStats, weightDistribution] = await Promise.all([
      db.stakingSnapshot.aggregate({
        where: { epochId: targetEpochId },
        _sum: {
          amount: true,
          effectiveWeight: true,
        },
        _avg: {
          amount: true,
          weight: true,
        },
        _count: true,
      }),
      db.stakingSnapshot.groupBy({
        where: { epochId: targetEpochId },
        by: ['weight'],
        _sum: {
          amount: true,
          effectiveWeight: true,
        },
        _count: true,
      }),
    ]);

    if (stakingStats._count === 0) {
      return res.status(404).json({
        error: 'No staking data found for epoch',
        epochId: targetEpochId.toString(),
      });
    }

    // Map weights to lock durations
    const weightToLockDuration = {
      1000: '30 days',
      1500: '90 days', 
      2000: '180 days',
      3000: '365 days',
    };

    const response = {
      epochId: targetEpochId.toString(),
      overview: {
        totalStakers: stakingStats._count,
        totalStaked: stakingStats._sum.amount?.toString() || '0',
        totalEffectiveWeight: stakingStats._sum.effectiveWeight?.toString() || '0',
        averageStaked: stakingStats._avg.amount?.toString() || '0',
        averageWeight: stakingStats._avg.weight?.toFixed(0) || '0',
        averageMultiplier: stakingStats._avg.weight 
          ? (stakingStats._avg.weight / 1000).toFixed(2) + 'x'
          : '0x',
      },
      distribution: weightDistribution.map(dist => ({
        lockDuration: weightToLockDuration[dist.weight as keyof typeof weightToLockDuration] || 'Unknown',
        weight: dist.weight,
        multiplier: (dist.weight / 1000).toFixed(1) + 'x',
        stakers: dist._count,
        totalStaked: dist._sum.amount?.toString() || '0',
        totalEffectiveWeight: dist._sum.effectiveWeight?.toString() || '0',
        percentage: ((dist._count / stakingStats._count) * 100).toFixed(2),
      })).sort((a, b) => b.weight - a.weight),
    };

    logger.info(`Retrieved staking stats for epoch ${targetEpochId}: ${stakingStats._count} stakers`);
    res.json(response);
  })
);

/**
 * GET /staking/leaderboard
 * Get top stakers by effective weight
 */
router.get('/leaderboard',
  [
    query('epoch')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Epoch must be a non-negative integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const epochId = req.query.epoch ? BigInt(req.query.epoch as string) : undefined;
    const limit = parseInt(req.query.limit as string) || 25;

    logger.debug('Fetching staking leaderboard', {
      epochId: epochId?.toString(),
      limit,
    });

    // Get target epoch
    let targetEpochId = epochId;
    if (!targetEpochId) {
      const latestEpoch = await db.revenueEpoch.findFirst({
        orderBy: { epochId: 'desc' },
        select: { epochId: true },
      });
      
      if (!latestEpoch) {
        return res.status(404).json({
          error: 'No revenue epochs found',
        });
      }
      
      targetEpochId = latestEpoch.epochId;
    }

    const topStakers = await db.stakingSnapshot.findMany({
      where: { epochId: targetEpochId },
      orderBy: { effectiveWeight: 'desc' },
      take: limit,
    });

    if (topStakers.length === 0) {
      return res.status(404).json({
        error: 'No staking data found for epoch',
        epochId: targetEpochId.toString(),
      });
    }

    // Get total effective weight for percentage calculation
    const totalStats = await db.stakingSnapshot.aggregate({
      where: { epochId: targetEpochId },
      _sum: { effectiveWeight: true },
    });

    const totalEffectiveWeight = Number(totalStats._sum.effectiveWeight || 0);

    // Map weight to lock duration
    const weightToLockDuration = {
      1000: '30 days',
      1500: '90 days', 
      2000: '180 days',
      3000: '365 days',
    };

    const response = {
      epochId: targetEpochId.toString(),
      leaderboard: topStakers.map((staker, index) => ({
        rank: index + 1,
        address: staker.account,
        amount: staker.amount.toString(),
        weight: staker.weight,
        effectiveWeight: staker.effectiveWeight.toString(),
        lockDuration: weightToLockDuration[staker.weight as keyof typeof weightToLockDuration] || 'Unknown',
        multiplier: (staker.weight / 1000).toFixed(1) + 'x',
        shareOfPool: totalEffectiveWeight > 0 
          ? ((Number(staker.effectiveWeight) / totalEffectiveWeight) * 100).toFixed(4) + '%'
          : '0%',
        lockUntil: staker.lockUntil?.toISOString() || null,
      })),
      summary: {
        totalShown: topStakers.length,
        totalEffectiveWeight: totalEffectiveWeight.toString(),
      },
    };

    logger.info(`Retrieved top ${topStakers.length} stakers for epoch ${targetEpochId}`);
    res.json(response);
  })
);

export default router;
