import express from 'express';
import { param, query } from 'express-validator';
import { asyncHandler, validationMiddleware } from '../middleware/index.js';
import { db } from '../config/database.js';
import logger from '../config/logger.js';

const router: any = express.Router();

/**
 * GET /revenue/epoch/:id
 * Get revenue epoch details including complete distribution breakdown
 */
router.get('/epoch/:id',
  [
    param('id')
      .isInt({ min: 0 })
      .withMessage('Epoch ID must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const epochId = BigInt(req.params.id);

    logger.debug(`Fetching revenue epoch ${epochId}`);

    const epoch = await db.revenueEpoch.findUnique({
      where: { epochId },
      include: {
        machineRevenues: {
          orderBy: { machineId: 'asc' },
        },
        merkleRoots: {
          orderBy: { group: 'asc' },
        },
      },
    });

    if (!epoch) {
      return res.status(404).json({
        error: 'Epoch not found',
        epochId: epochId.toString(),
      });
    }

    // Convert Prisma Decimal to string for JSON serialization
    const response = {
      epochId: epoch.epochId.toString(),
      totalR: epoch.totalR.toString(),
      distribution: {
        opc: {
          amount: epoch.opc.toString(),
          percentage: 70, // Base percentage, actual may include remainder
          description: 'Operational costs (70% + remainder)',
        },
        alpha: {
          amount: epoch.alpha.toString(),
          percentage: 20,
          description: 'CHG Staking rewards (α pool)',
        },
        beta: {
          amount: epoch.beta.toString(),
          percentage: 3,
          description: 'NFTClaw L1 rewards (β pool)',
        },
        gamma: {
          amount: epoch.gamma.toString(),
          percentage: 3,
          description: 'NFTOwner L2 rewards (γ pool)',
        },
        delta: {
          amount: epoch.delta.toString(),
          percentage: 4,
          description: 'Reward pool (δ pool)',
        },
      },
      blockchain: {
        blockNumber: epoch.blockNumber.toString(),
        blockTime: epoch.blockTime.toISOString(),
        txHash: epoch.txHash,
      },
      machines: epoch.machineRevenues.map(mr => ({
        machineId: mr.machineId.toString(),
        revenue: mr.Rm.toString(),
        txHash: mr.txHash,
        blockNumber: mr.blockNumber.toString(),
      })),
      merkleRoots: epoch.merkleRoots.map(root => ({
        group: root.group,
        root: root.root,
        total: root.total.toString(),
        leafCount: root.leafCount,
        published: root.published,
        publishedTx: root.publishedTx,
      })),
      timestamps: {
        createdAt: epoch.createdAt.toISOString(),
        updatedAt: epoch.updatedAt.toISOString(),
      },
    };

    logger.info(`Retrieved epoch ${epochId} with ${epoch.machineRevenues.length} machine revenues`);
    res.json(response);
  })
);

/**
 * GET /revenue/epochs
 * Get list of revenue epochs with pagination
 */
router.get('/epochs',
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('from')
      .optional()
      .isInt({ min: 0 })
      .withMessage('From epoch must be a non-negative integer'),
    query('to')
      .optional()
      .isInt({ min: 0 })
      .withMessage('To epoch must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const from = req.query.from ? BigInt(req.query.from as string) : undefined;
    const to = req.query.to ? BigInt(req.query.to as string) : undefined;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};
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

    const [epochs, total] = await Promise.all([
      db.revenueEpoch.findMany({
        where,
        orderBy: { epochId: 'desc' },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              machineRevenues: true,
              merkleRoots: true,
            },
          },
        },
      }),
      db.revenueEpoch.count({ where }),
    ]);

    const response = {
      epochs: epochs.map(epoch => ({
        epochId: epoch.epochId.toString(),
        totalR: epoch.totalR.toString(),
        distribution: {
          opc: epoch.opc.toString(),
          alpha: epoch.alpha.toString(),
          beta: epoch.beta.toString(),
          gamma: epoch.gamma.toString(),
          delta: epoch.delta.toString(),
        },
        blockchain: {
          blockNumber: epoch.blockNumber.toString(),
          blockTime: epoch.blockTime.toISOString(),
          txHash: epoch.txHash,
        },
        counts: {
          machines: epoch._count.machineRevenues,
          merkleRoots: epoch._count.merkleRoots,
        },
        timestamps: {
          createdAt: epoch.createdAt.toISOString(),
          updatedAt: epoch.updatedAt.toISOString(),
        },
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };

    logger.debug(`Retrieved ${epochs.length} epochs (page ${page}, total ${total})`);
    res.json(response);
  })
);

/**
 * GET /revenue/latest
 * Get the latest revenue epoch
 */
router.get('/latest',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const latestEpoch = await db.revenueEpoch.findFirst({
      orderBy: { epochId: 'desc' },
      include: {
        machineRevenues: {
          orderBy: { machineId: 'asc' },
        },
        merkleRoots: {
          orderBy: { group: 'asc' },
        },
      },
    });

    if (!latestEpoch) {
      return res.status(404).json({
        error: 'No revenue epochs found',
      });
    }

    const response = {
      epochId: latestEpoch.epochId.toString(),
      totalR: latestEpoch.totalR.toString(),
      distribution: {
        opc: {
          amount: latestEpoch.opc.toString(),
          percentage: 70,
          description: 'Operational costs (70% + remainder)',
        },
        alpha: {
          amount: latestEpoch.alpha.toString(),
          percentage: 20,
          description: 'CHG Staking rewards (α pool)',
        },
        beta: {
          amount: latestEpoch.beta.toString(),
          percentage: 3,
          description: 'NFTClaw L1 rewards (β pool)',
        },
        gamma: {
          amount: latestEpoch.gamma.toString(),
          percentage: 3,
          description: 'NFTOwner L2 rewards (γ pool)',
        },
        delta: {
          amount: latestEpoch.delta.toString(),
          percentage: 4,
          description: 'Reward pool (δ pool)',
        },
      },
      blockchain: {
        blockNumber: latestEpoch.blockNumber.toString(),
        blockTime: latestEpoch.blockTime.toISOString(),
        txHash: latestEpoch.txHash,
      },
      machines: latestEpoch.machineRevenues.map(mr => ({
        machineId: mr.machineId.toString(),
        revenue: mr.Rm.toString(),
        txHash: mr.txHash,
        blockNumber: mr.blockNumber.toString(),
      })),
      merkleRoots: latestEpoch.merkleRoots.map(root => ({
        group: root.group,
        root: root.root,
        total: root.total.toString(),
        leafCount: root.leafCount,
        published: root.published,
        publishedTx: root.publishedTx,
      })),
      timestamps: {
        createdAt: latestEpoch.createdAt.toISOString(),
        updatedAt: latestEpoch.updatedAt.toISOString(),
      },
    };

    logger.info(`Retrieved latest epoch ${latestEpoch.epochId}`);
    res.json(response);
  })
);

/**
 * GET /revenue/stats
 * Get revenue statistics and summary
 */
router.get('/stats',
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const [epochCount, totalRevenue, latestEpoch] = await Promise.all([
      db.revenueEpoch.count(),
      db.revenueEpoch.aggregate({
        _sum: {
          totalR: true,
        },
      }),
      db.revenueEpoch.findFirst({
        orderBy: { epochId: 'desc' },
        select: {
          epochId: true,
          totalR: true,
          blockTime: true,
        },
      }),
    ]);

    const stats = {
      epochs: {
        total: epochCount,
        latest: latestEpoch?.epochId.toString() || '0',
        latestRevenue: latestEpoch?.totalR.toString() || '0',
        latestTime: latestEpoch?.blockTime.toISOString() || null,
      },
      revenue: {
        total: totalRevenue._sum.totalR?.toString() || '0',
        average: epochCount > 0 
          ? (Number(totalRevenue._sum.totalR || 0) / epochCount).toFixed(6)
          : '0',
      },
    };

    logger.debug('Retrieved revenue statistics');
    res.json(stats);
  })
);

export default router;
