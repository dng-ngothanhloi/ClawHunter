import express from 'express';
import { param, query } from 'express-validator';
import { asyncHandler, validationMiddleware } from '../middleware/index.js';
import { db } from '../config/database.js';
import logger from '../config/logger.js';

const router: any = express.Router();

/**
 * GET /machine/:id/revenue
 * Get revenue history for a specific machine
 */
router.get('/:id/revenue',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Machine ID must be a positive integer'),
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
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const machineId = BigInt(req.params.id);
    const from = req.query.from ? BigInt(req.query.from as string) : undefined;
    const to = req.query.to ? BigInt(req.query.to as string) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;

    const skip = (page - 1) * limit;

    logger.debug(`Fetching revenue history for machine ${machineId}`, {
      from: from?.toString(),
      to: to?.toString(),
      limit,
      page,
    });

    // Build where clause
    const where: any = { machineId };
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

    const [revenues, total] = await Promise.all([
      db.machineRevenue.findMany({
        where,
        orderBy: { epochId: 'desc' },
        skip,
        take: limit,
        include: {
          epoch: {
            select: {
              blockTime: true,
              totalR: true,
            },
          },
        },
      }),
      db.machineRevenue.count({ where }),
    ]);

    if (total === 0) {
      return res.status(404).json({
        error: 'No revenue history found for machine',
        machineId: machineId.toString(),
      });
    }

    // Calculate statistics
    const totalRevenue = revenues.reduce((sum, rev) => sum + Number(rev.Rm), 0);
    const averageRevenue = totalRevenue / revenues.length;

    const response = {
      machineId: machineId.toString(),
      revenues: revenues.map(revenue => ({
        epochId: revenue.epochId.toString(),
        revenue: revenue.Rm.toString(),
        percentage: revenue.epoch 
          ? ((Number(revenue.Rm) / Number(revenue.epoch.totalR)) * 100).toFixed(4)
          : '0',
        blockchain: {
          txHash: revenue.txHash,
          blockNumber: revenue.blockNumber.toString(),
          blockTime: revenue.epoch?.blockTime.toISOString(),
        },
        createdAt: revenue.createdAt.toISOString(),
      })),
      statistics: {
        totalRevenue: totalRevenue.toFixed(6),
        averageRevenue: averageRevenue.toFixed(6),
        epochCount: total,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: skip + limit < total,
        hasPrev: page > 1,
      },
    };

    logger.info(`Retrieved ${revenues.length} revenue records for machine ${machineId}`);
    res.json(response);
  })
);

/**
 * GET /machine/:id
 * Get machine information and current status
 */
router.get('/:id',
  [
    param('id')
      .isInt({ min: 1 })
      .withMessage('Machine ID must be a positive integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const machineId = BigInt(req.params.id);

    logger.debug(`Fetching machine info for ${machineId}`);

    // Get machine revenue statistics
    const [revenueStats, latestRevenue, firstRevenue] = await Promise.all([
      db.machineRevenue.aggregate({
        where: { machineId },
        _sum: { Rm: true },
        _avg: { Rm: true },
        _count: true,
      }),
      db.machineRevenue.findFirst({
        where: { machineId },
        orderBy: { epochId: 'desc' },
        include: {
          epoch: {
            select: {
              blockTime: true,
              epochId: true,
            },
          },
        },
      }),
      db.machineRevenue.findFirst({
        where: { machineId },
        orderBy: { epochId: 'asc' },
        include: {
          epoch: {
            select: {
              blockTime: true,
              epochId: true,
            },
          },
        },
      }),
    ]);

    if (revenueStats._count === 0) {
      return res.status(404).json({
        error: 'Machine not found or no revenue history',
        machineId: machineId.toString(),
      });
    }

    const response = {
      machineId: machineId.toString(),
      status: 'active',
      revenue: {
        total: revenueStats._sum.Rm?.toString() || '0',
        average: revenueStats._avg.Rm?.toString() || '0',
        epochs: revenueStats._count,
        latest: {
          epochId: latestRevenue?.epochId.toString(),
          amount: latestRevenue?.Rm.toString(),
          blockTime: latestRevenue?.epoch?.blockTime.toISOString(),
        },
        first: {
          epochId: firstRevenue?.epochId.toString(),
          amount: firstRevenue?.Rm.toString(),
          blockTime: firstRevenue?.epoch?.blockTime.toISOString(),
        },
      },
      // Note: Machine metadata (location, mode, rarity) would come from NFT metadata
      // This would be enhanced with actual machine metadata in production
      metadata: {
        // Placeholder - would be loaded from NFT metadata service
        location: 'Unknown',
        mode: 'Unknown',
        rarity: 'Unknown',
        note: 'Machine metadata integration pending',
      },
    };

    logger.info(`Retrieved machine info for ${machineId}`);
    res.json(response);
  })
);

/**
 * GET /machines
 * Get list of all machines with revenue activity
 */
router.get('/',
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('Limit must be between 1 and 1000'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('sortBy')
      .optional()
      .isIn(['machineId', 'totalRevenue', 'averageRevenue', 'epochCount'])
      .withMessage('Sort by must be one of: machineId, totalRevenue, averageRevenue, epochCount'),
    query('order')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Order must be asc or desc'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const page = parseInt(req.query.page as string) || 1;
    const sortBy = req.query.sortBy as string || 'totalRevenue';
    const order = req.query.order as string || 'desc';

    const skip = (page - 1) * limit;

    logger.debug('Fetching machines list', { limit, page, sortBy, order });

    // Get machine revenue aggregations
    const machineStats = await db.machineRevenue.groupBy({
      by: ['machineId'],
      _sum: { Rm: true },
      _avg: { Rm: true },
      _count: true,
      _max: { epochId: true },
      _min: { epochId: true },
    });

    // Sort the results
    const sortedStats = machineStats.sort((a, b) => {
      let aValue: number, bValue: number;
      
      switch (sortBy) {
        case 'machineId':
          aValue = Number(a.machineId);
          bValue = Number(b.machineId);
          break;
        case 'totalRevenue':
          aValue = Number(a._sum.Rm || 0);
          bValue = Number(b._sum.Rm || 0);
          break;
        case 'averageRevenue':
          aValue = Number(a._avg.Rm || 0);
          bValue = Number(b._avg.Rm || 0);
          break;
        case 'epochCount':
          aValue = a._count;
          bValue = b._count;
          break;
        default:
          aValue = Number(a._sum.Rm || 0);
          bValue = Number(b._sum.Rm || 0);
      }

      return order === 'asc' ? aValue - bValue : bValue - aValue;
    });

    // Apply pagination
    const paginatedStats = sortedStats.slice(skip, skip + limit);
    const total = machineStats.length;

    const response = {
      machines: paginatedStats.map(stat => ({
        machineId: stat.machineId.toString(),
        revenue: {
          total: stat._sum.Rm?.toString() || '0',
          average: stat._avg.Rm?.toString() || '0',
          epochs: stat._count,
          firstEpoch: stat._min.epochId?.toString(),
          lastEpoch: stat._max.epochId?.toString(),
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
      sorting: {
        sortBy,
        order,
      },
    };

    logger.info(`Retrieved ${paginatedStats.length} machines (page ${page}, total ${total})`);
    res.json(response);
  })
);

export default router;
