import express from 'express';
import { param, query } from 'express-validator';
import { asyncHandler, validationMiddleware } from '../middleware/index.js';
import { db } from '../config/database.js';
import logger from '../config/logger.js';

const router: any = express.Router();

/**
 * GET /nftowner/:addr/shares
 * Get NFT owner share information and reward eligibility
 */
router.get('/:addr/shares',
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

    logger.debug(`Fetching NFT owner shares for ${address}`, {
      epochId: epochId?.toString(),
    });

    // If specific epoch requested, get that epoch's snapshot
    if (epochId !== undefined) {
      const shares = await db.ownerShareSnapshot.findMany({
        where: {
          epochId,
          account: address,
        },
        orderBy: { machineId: 'asc' },
      });

      if (shares.length === 0) {
        return res.status(404).json({
          error: 'No shares found for address in specified epoch',
          address,
          epochId: epochId.toString(),
        });
      }

      const totalEffectiveShare = shares.reduce(
        (sum, share) => sum + Number(share.effectiveShare), 
        0
      );

      const response = {
        address,
        epochId: epochId.toString(),
        shares: shares.map(share => ({
          machineId: share.machineId.toString(),
          shareBps: share.shareBps,
          effectiveShare: share.effectiveShare.toString(),
        })),
        totalEffectiveShare: totalEffectiveShare.toFixed(6),
        shareCount: shares.length,
      };

      logger.info(`Retrieved ${shares.length} shares for ${address} in epoch ${epochId}`);
      return res.json(response);
    }

    // Get latest epoch shares
    const latestEpoch = await db.revenueEpoch.findFirst({
      orderBy: { epochId: 'desc' },
      select: { epochId: true },
    });

    if (!latestEpoch) {
      return res.status(404).json({
        error: 'No revenue epochs found',
      });
    }

    const shares = await db.ownerShareSnapshot.findMany({
      where: {
        epochId: latestEpoch.epochId,
        account: address,
      },
      orderBy: { machineId: 'asc' },
    });

    if (shares.length === 0) {
      return res.status(404).json({
        error: 'No shares found for address',
        address,
        latestEpoch: latestEpoch.epochId.toString(),
      });
    }

    const totalEffectiveShare = shares.reduce(
      (sum, share) => sum + Number(share.effectiveShare), 
      0
    );

    const response = {
      address,
      epochId: latestEpoch.epochId.toString(),
      shares: shares.map(share => ({
        machineId: share.machineId.toString(),
        shareBps: share.shareBps,
        effectiveShare: share.effectiveShare.toString(),
      })),
      totalEffectiveShare: totalEffectiveShare.toFixed(6),
      shareCount: shares.length,
    };

    logger.info(`Retrieved ${shares.length} shares for ${address} in latest epoch`);
    res.json(response);
  })
);

/**
 * GET /nftowner/:addr/history
 * Get historical share information across epochs
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

    logger.debug(`Fetching NFT owner history for ${address}`, {
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

    // Get share snapshots grouped by epoch
    const snapshots = await db.ownerShareSnapshot.findMany({
      where,
      orderBy: [
        { epochId: 'desc' },
        { machineId: 'asc' },
      ],
      take: limit * 10, // Get more records to group by epoch
    });

    if (snapshots.length === 0) {
      return res.status(404).json({
        error: 'No share history found for address',
        address,
      });
    }

    // Group by epoch and calculate totals
    const epochGroups = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      const epochKey = snapshot.epochId.toString();
      if (!epochGroups.has(epochKey)) {
        epochGroups.set(epochKey, []);
      }
      epochGroups.get(epochKey)!.push(snapshot);
    }

    // Take only the requested number of epochs
    const epochEntries = Array.from(epochGroups.entries()).slice(0, limit);

    const response = {
      address,
      history: epochEntries.map(([epochId, epochShares]) => {
        const totalEffectiveShare = epochShares.reduce(
          (sum, share) => sum + Number(share.effectiveShare), 
          0
        );

        return {
          epochId,
          shares: epochShares.map(share => ({
            machineId: share.machineId.toString(),
            shareBps: share.shareBps,
            effectiveShare: share.effectiveShare.toString(),
          })),
          totalEffectiveShare: totalEffectiveShare.toFixed(6),
          shareCount: epochShares.length,
          snapshotTime: epochShares[0].createdAt.toISOString(),
        };
      }),
      totalEpochs: epochEntries.length,
    };

    logger.info(`Retrieved share history for ${address} across ${epochEntries.length} epochs`);
    res.json(response);
  })
);

/**
 * GET /nftowner/machines/:machineId/owners
 * Get all owners of a specific machine
 */
router.get('/machines/:machineId/owners',
  [
    param('machineId')
      .isInt({ min: 1 })
      .withMessage('Machine ID must be a positive integer'),
    query('epoch')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Epoch must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const machineId = BigInt(req.params.machineId);
    const epochId = req.query.epoch ? BigInt(req.query.epoch as string) : undefined;

    logger.debug(`Fetching owners for machine ${machineId}`, {
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

    const owners = await db.ownerShareSnapshot.findMany({
      where: {
        epochId: targetEpochId,
        machineId,
      },
      orderBy: { shareBps: 'desc' },
    });

    if (owners.length === 0) {
      return res.status(404).json({
        error: 'No owners found for machine',
        machineId: machineId.toString(),
        epochId: targetEpochId.toString(),
      });
    }

    const totalShares = owners.reduce((sum, owner) => sum + owner.shareBps, 0);
    const totalEffectiveShare = owners.reduce(
      (sum, owner) => sum + Number(owner.effectiveShare), 
      0
    );

    const response = {
      machineId: machineId.toString(),
      epochId: targetEpochId.toString(),
      owners: owners.map(owner => ({
        address: owner.account,
        shareBps: owner.shareBps,
        sharePercentage: ((owner.shareBps / 10000) * 100).toFixed(4),
        effectiveShare: owner.effectiveShare.toString(),
        snapshotTime: owner.createdAt.toISOString(),
      })),
      summary: {
        totalOwners: owners.length,
        totalShareBps: totalShares,
        totalEffectiveShare: totalEffectiveShare.toFixed(6),
        fullyOwned: totalShares >= 10000,
      },
    };

    logger.info(`Retrieved ${owners.length} owners for machine ${machineId}`);
    res.json(response);
  })
);

export default router;
