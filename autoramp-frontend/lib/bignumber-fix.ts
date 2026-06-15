/**
 * BigNumber.js Precision Fix
 *
 * ROOT CAUSE: @stellar/stellar-base (pulled in by @circle-fin/bridge-kit)
 * creates a BigNumber clone with DEBUG = true:
 *
 *   var BigNumber = require("bignumber.js").clone();
 *   BigNumber.DEBUG = true;
 *
 * When DEBUG is true, passing a JS number with more than 15 significant
 * digits to ANY BigNumber method throws:
 *   "[BigNumber Error] Number primitive has more than 15 significant digits"
 *
 * Our CNGN balances (e.g. 2875134.665266314 = 16 significant digits)
 * trigger this error during swaps.
 *
 * FIX: We patch BigNumber.clone() so that any clone created by any library
 * will have DEBUG forced to false.
 *
 * Import this file BEFORE any @circle-fin or @stellar imports.
 */
import BigNumber from "bignumber.js";

// Disable on the default instance
BigNumber.DEBUG = false;

// Patch clone() so @stellar/stellar-base can't re-enable it
const originalClone = BigNumber.clone.bind(BigNumber);
BigNumber.clone = function patchedClone(config?: BigNumber.Config) {
  const cloned = originalClone(config);
  cloned.DEBUG = false;
  return cloned;
};
