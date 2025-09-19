import express from 'express';
import { param, query, body } from 'express-validator';
import { asyncHandler, validationMiddleware } from '../middleware/index.js';
import { db } from '../config/database.js';
import logger from '../config/logger.js';
import { ClaimTransactionService } from '../services/ClaimTransactionService.js';

const router: any = express.Router();
const claimTransactionService = new ClaimTransactionService();

/**
 * GET /claims/:addr
 * Get pending claims for an address across all groups (α, β, γ)
 */
router.get('/:addr',
  [
    param('addr')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Address must be a valid Ethereum address'),
    query('group')
      .optional()
      .isIn(['A', 'B', 'G'])
      .withMessage('Group must be one of: A, B, G'),
    query('claimed')
      .optional()
      .isBoolean()
      .withMessage('Claimed must be a boolean'),
    query('epoch')
      .optional()
      .isInt({ min: 0 })
      .withMessage('Epoch must be a non-negative integer'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const address = req.params.addr.toLowerCase();
    const group = req.query.group as string;
    const includeClaimed = req.query.claimed === 'true';
    const epochId = req.query.epoch ? BigInt(req.query.epoch as string) : undefined;

    logger.debug(`Fetching claims for ${address}`, {
      group,
      includeClaimed,
      epochId: epochId?.toString(),
    });

    // Build where clause
    const where: any = { account: address };
    
    if (group) {
      where.group = group;
    }
    
    if (!includeClaimed) {
      where.claimed = false;
    }
    
    if (epochId !== undefined) {
      where.epochId = epochId;
    }

    const claims = await db.merkleLeaf.findMany({
      where,
      orderBy: [
        { epochId: 'desc' },
        { group: 'asc' },
      ],
      include: {
        epoch: {
          select: {
            blockTime: true,
            totalR: true,
          },
        },
        merkleRoot: {
          select: {
            root: true,
            published: true,
            publishedTx: true,
          },
        },
      },
    });

    if (claims.length === 0) {
      return res.status(404).json({
        error: 'No claims found for address',
        address,
        filters: {
          group: group || 'all',
          includeClaimed,
          epochId: epochId?.toString(),
        },
      });
    }

    // Calculate totals
    const totalClaimable = claims
      .filter(claim => !claim.claimed)
      .reduce((sum, claim) => sum + Number(claim.amount), 0);

    const totalClaimed = claims
      .filter(claim => claim.claimed)
      .reduce((sum, claim) => sum + Number(claim.amount), 0);

    // Group descriptions
    const groupDescriptions = {
      A: 'CHG Staking Rewards (α pool)',
      B: 'NFTClaw L1 Rewards (β pool)',
      G: 'NFTOwner L2 Rewards (γ pool)',
    };

    const response = {
      address,
      claims: claims.map(claim => {
        const proof = typeof claim.proof === 'string' 
          ? JSON.parse(claim.proof) 
          : claim.proof;

        return {
          epochId: claim.epochId.toString(),
          group: claim.group,
          groupDescription: groupDescriptions[claim.group as keyof typeof groupDescriptions] || 'Unknown',
          amount: claim.amount.toString(),
          leafHash: claim.leafHash,
          proof,
          claimed: claim.claimed,
          claimedTx: claim.claimedTx,
          claimedAt: claim.claimedAt?.toISOString() || null,
          merkleRoot: {
            root: claim.merkleRoot?.root,
            published: claim.merkleRoot?.published || false,
            publishedTx: claim.merkleRoot?.publishedTx,
          },
          epoch: {
            blockTime: claim.epoch?.blockTime.toISOString(),
            totalRevenue: claim.epoch?.totalR.toString(),
          },
          createdAt: claim.createdAt.toISOString(),
          updatedAt: claim.updatedAt.toISOString(),
        };
      }),
      summary: {
        totalClaims: claims.length,
        pendingClaims: claims.filter(c => !c.claimed).length,
        claimedCount: claims.filter(c => c.claimed).length,
        totalClaimable: totalClaimable.toFixed(6),
        totalClaimed: totalClaimed.toFixed(6),
        byGroup: {
          A: {
            pending: claims.filter(c => c.group === 'A' && !c.claimed).length,
            claimed: claims.filter(c => c.group === 'A' && c.claimed).length,
            pendingAmount: claims
              .filter(c => c.group === 'A' && !c.claimed)
              .reduce((sum, c) => sum + Number(c.amount), 0)
              .toFixed(6),
          },
          B: {
            pending: claims.filter(c => c.group === 'B' && !c.claimed).length,
            claimed: claims.filter(c => c.group === 'B' && c.claimed).length,
            pendingAmount: claims
              .filter(c => c.group === 'B' && !c.claimed)
              .reduce((sum, c) => sum + Number(c.amount), 0)
              .toFixed(6),
          },
          G: {
            pending: claims.filter(c => c.group === 'G' && !c.claimed).length,
            claimed: claims.filter(c => c.group === 'G' && c.claimed).length,
            pendingAmount: claims
              .filter(c => c.group === 'G' && !c.claimed)
              .reduce((sum, c) => sum + Number(c.amount), 0)
              .toFixed(6),
          },
        },
      },
    };

    logger.info(`Retrieved ${claims.length} claims for ${address} (${response.summary.pendingClaims} pending)`);
    res.json(response);
  })
);

/**
 * GET /claims/:addr/:epochId/:group
 * Get specific claim with proof for claiming
 */
router.get('/:addr/:epochId/:group',
  [
    param('addr')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Address must be a valid Ethereum address'),
    param('epochId')
      .isInt({ min: 0 })
      .withMessage('Epoch ID must be a non-negative integer'),
    param('group')
      .isIn(['A', 'B', 'G'])
      .withMessage('Group must be one of: A, B, G'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const address = req.params.addr.toLowerCase();
    const epochId = BigInt(req.params.epochId);
    const group = req.params.group;

    logger.debug(`Fetching specific claim for ${address}`, {
      epochId: epochId.toString(),
      group,
    });

    const claim = await db.merkleLeaf.findUnique({
      where: {
        epochId_group_account: {
          epochId,
          group,
          account: address,
        },
      },
      include: {
        epoch: {
          select: {
            blockTime: true,
            totalR: true,
            alpha: true,
            beta: true,
            gamma: true,
          },
        },
        merkleRoot: {
          select: {
            root: true,
            total: true,
            leafCount: true,
            published: true,
            publishedTx: true,
          },
        },
      },
    });

    if (!claim) {
      return res.status(404).json({
        error: 'Claim not found',
        address,
        epochId: epochId.toString(),
        group,
      });
    }

    const proof = typeof claim.proof === 'string' 
      ? JSON.parse(claim.proof) 
      : claim.proof;

    // Group descriptions and pool amounts
    const groupInfo = {
      A: {
        description: 'CHG Staking Rewards (α pool)',
        poolAmount: claim.epoch?.alpha.toString(),
      },
      B: {
        description: 'NFTClaw L1 Rewards (β pool)',
        poolAmount: claim.epoch?.beta.toString(),
      },
      G: {
        description: 'NFTOwner L2 Rewards (γ pool)',
        poolAmount: claim.epoch?.gamma.toString(),
      },
    };

    const response = {
      address,
      epochId: epochId.toString(),
      group,
      groupInfo: groupInfo[group as keyof typeof groupInfo],
      claim: {
        amount: claim.amount.toString(),
        leafHash: claim.leafHash,
        proof,
        claimed: claim.claimed,
        claimedTx: claim.claimedTx,
        claimedAt: claim.claimedAt?.toISOString() || null,
      },
      merkleRoot: {
        root: claim.merkleRoot?.root,
        total: claim.merkleRoot?.total.toString(),
        leafCount: claim.merkleRoot?.leafCount,
        published: claim.merkleRoot?.published || false,
        publishedTx: claim.merkleRoot?.publishedTx,
      },
      epoch: {
        blockTime: claim.epoch?.blockTime.toISOString(),
        totalRevenue: claim.epoch?.totalR.toString(),
      },
      claimable: !claim.claimed && (claim.merkleRoot?.published || false),
      timestamps: {
        createdAt: claim.createdAt.toISOString(),
        updatedAt: claim.updatedAt.toISOString(),
      },
    };

    logger.info(`Retrieved claim for ${address} - Epoch ${epochId}, Group ${group}: ${claim.amount} USDT`);
    res.json(response);
  })
);

/**
 * POST /claims/prepare
 * Prepare claims for an epoch (Admin endpoint)
 */
router.post('/prepare',
  [
    body('epochId')
      .isInt({ min: 0 })
      .withMessage('Epoch ID must be a non-negative integer'),
    body('groups')
      .optional()
      .isArray()
      .custom((groups) => {
        if (!Array.isArray(groups)) return false;
        return groups.every(group => ['A', 'B', 'G'].includes(group));
      })
      .withMessage('Groups must be an array of A, B, G'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const epochId = BigInt(req.body.epochId);
    const groups = req.body.groups || ['A', 'B', 'G'];

    logger.info(`Preparing claims for epoch ${epochId}`, { groups });

    // Check if epoch exists
    const epoch = await db.revenueEpoch.findUnique({
      where: { epochId },
    });

    if (!epoch) {
      return res.status(404).json({
        error: 'Epoch not found',
        epochId: epochId.toString(),
      });
    }

    // Check existing Merkle roots
    const existingRoots = await db.merkleRoot.findMany({
      where: {
        epochId,
        group: { in: groups },
      },
    });

    if (existingRoots.length === 0) {
      return res.status(400).json({
        error: 'No Merkle roots found for specified groups',
        epochId: epochId.toString(),
        groups,
        note: 'Merkle trees must be computed by the indexer first',
      });
    }

    // Count prepared claims per group
    const prepared: Record<string, number> = {};

    for (const group of groups) {
      const claimCount = await db.merkleLeaf.count({
        where: {
          epochId,
          group,
        },
      });

      prepared[group] = claimCount;
    }

    const response = {
      epochId: epochId.toString(),
      groups: groups,
      prepared,
      totalPrepared: Object.values(prepared).reduce((sum, count) => sum + count, 0),
      merkleRoots: existingRoots.map(root => ({
        group: root.group,
        root: root.root,
        leafCount: root.leafCount,
        published: root.published,
      })),
    };

    logger.info(`Claims preparation completed for epoch ${epochId}`, response.prepared);
    res.json(response);
  })
);

/**
 * GET /claims/stats
 * Get overall claims statistics
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

    logger.debug('Fetching claims statistics', {
      epochId: epochId?.toString(),
    });

    // Build where clause
    const where: any = {};
    if (epochId !== undefined) {
      where.epochId = epochId;
    }

    const [totalStats, groupStats, claimStats] = await Promise.all([
      db.merkleLeaf.aggregate({
        where,
        _sum: { amount: true },
        _count: true,
      }),
      db.merkleLeaf.groupBy({
        where,
        by: ['group'],
        _sum: { amount: true },
        _count: true,
      }),
      db.merkleLeaf.groupBy({
        where,
        by: ['claimed'],
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const claimedStats = claimStats.find(stat => stat.claimed) || { _sum: { amount: null }, _count: 0 };
    const unclaimedStats = claimStats.find(stat => !stat.claimed) || { _sum: { amount: null }, _count: 0 };

    const groupDescriptions = {
      A: 'CHG Staking Rewards (α pool)',
      B: 'NFTClaw L1 Rewards (β pool)',
      G: 'NFTOwner L2 Rewards (γ pool)',
    };

    const response = {
      ...(epochId && { epochId: epochId.toString() }),
      overview: {
        totalClaims: totalStats._count,
        totalAmount: totalStats._sum.amount?.toString() || '0',
        claimedCount: claimedStats._count,
        claimedAmount: claimedStats._sum.amount?.toString() || '0',
        pendingCount: unclaimedStats._count,
        pendingAmount: unclaimedStats._sum.amount?.toString() || '0',
        claimRate: totalStats._count > 0 
          ? ((claimedStats._count / totalStats._count) * 100).toFixed(2) + '%'
          : '0%',
      },
      byGroup: groupStats.map(stat => ({
        group: stat.group,
        description: groupDescriptions[stat.group as keyof typeof groupDescriptions] || 'Unknown',
        claims: stat._count,
        totalAmount: stat._sum.amount?.toString() || '0',
      })).sort((a, b) => a.group.localeCompare(b.group)),
    };

    logger.info('Retrieved claims statistics', {
      totalClaims: totalStats._count,
      claimRate: response.overview.claimRate,
    });
    res.json(response);
  })
);

/**
 * POST /claims/prepare-transaction
 * Prepare claim transaction with gas estimation and validation
 */
router.post('/prepare-transaction',
  [
    body('beneficiary')
      .matches(/^0x[a-fA-F0-9]{40}$/)
      .withMessage('Beneficiary must be a valid Ethereum address'),
    body('epochIds')
      .isArray({ min: 1 })
      .withMessage('EpochIds must be a non-empty array'),
    body('epochIds.*')
      .isInt({ min: 0 })
      .withMessage('Each epochId must be a non-negative integer'),
    body('groups')
      .optional()
      .isArray()
      .withMessage('Groups must be an array'),
    body('groups.*')
      .optional()
      .isIn(['A', 'B', 'G'])
      .withMessage('Each group must be one of: A, B, G'),
  ],
  validationMiddleware,
  asyncHandler(async (req: express.Request, res: express.Response) => {
    const { beneficiary, epochIds, groups } = req.body;

    logger.info(`Preparing claim transaction for ${beneficiary}`, {
      epochIds,
      groups,
      requestId: req.requestId,
    });

    try {
      const preparation = await claimTransactionService.prepareClaim({
        beneficiary,
        epochIds,
        groups,
      });

      logger.info(`Claim transaction prepared successfully`, {
        beneficiary,
        claimCount: preparation.claimCount,
        totalClaimable: preparation.totalClaimable,
        gasEstimate: preparation.gasEstimate.gasLimit,
        requestId: req.requestId,
      });

      res.json({
        success: true,
        data: preparation,
        meta: {
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
          preparationExpiry: preparation.validUntil,
        },
      });

    } catch (error) {
      logger.error(`Failed to prepare claim transaction for ${beneficiary}:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        epochIds,
        groups,
        requestId: req.requestId,
      });

      if (error instanceof Error) {
        if (error.message.includes('No claimable rewards')) {
          return res.status(404).json({
            error: 'No claimable rewards found',
            message: error.message,
            beneficiary,
            epochIds,
            groups,
          });
        }

        if (error.message.includes('Invalid Merkle proof')) {
          return res.status(400).json({
            error: 'Invalid Merkle proof',
            message: error.message,
            note: 'Merkle tree data may be corrupted or outdated',
          });
        }
      }

      res.status(500).json({
        error: 'Failed to prepare claim transaction',
        message: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.requestId,
      });
    }
  })
);

export default router;
