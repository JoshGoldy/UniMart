/**
 * UniMart service facade.
 *
 * The original auth.js surface is kept for backwards compatibility while the
 * implementation now lives in focused service modules.
 */
export * from './authService.js';
export * from './listingService.js';
export * from './messagingService.js';
export * from './adminService.js';

import * as authService from './authService.js';
import * as listingService from './listingService.js';
import * as messagingService from './messagingService.js';
import * as adminService from './adminService.js';

const {
  _sb,
  _userFacingError,
  _edgeFunctionErrorMessage,
  ...publicAuthService
} = authService;

const {
  toUser,
  toListing,
  updateListingById,
  deleteListingById,
  ...publicListingService
} = listingService;

const {
  toOffer,
  toTransaction,
  toReview,
  toContentReport,
  toModerationAction,
  _uniqueValues,
  ...publicMessagingService
} = messagingService;

export const Auth = {
  ...publicAuthService,
  ...publicListingService,
  ...publicMessagingService,
  ...adminService,
};

export default Auth;
