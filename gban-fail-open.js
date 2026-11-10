"use strict";

const Module = require("module");
const path = require("path");

const utilsPath = path.resolve(__dirname, "utils.js");
const originalLoad = Module._load;
let fallbackInstalled = false;

Module._load = function loadWithGbanFallback(request, parent, isMain) {
  let resolvedPath = null;
  if (!fallbackInstalled && parent?.filename) {
    try {
      resolvedPath = Module._resolveFilename(request, parent, isMain);
    } catch (_) {
      // Let Node's original loader report resolution errors.
    }
  }

  const exports = originalLoad.call(this, request, parent, isMain);
  if (fallbackInstalled || resolvedPath !== utilsPath) {
    return exports;
  }

  const getGbanList = exports?.STBotApis?.prototype?.getGbanList;
  if (typeof getGbanList !== "function") {
    return exports;
  }

  exports.STBotApis.prototype.getGbanList = async function getGbanListWithFallback(...args) {
    const result = await getGbanList.apply(this, args);
    if (result !== null) {
      return result;
    }

    console.warn(
      "[GBAN FAIL-OPEN] STBot API unavailable; continuing without global-ban verification."
    );
    return { success: true, data: [] };
  };

  fallbackInstalled = true;
  return exports;
};
