const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  if (!process.env.SUBSCRIBE_TEMPLATE_ID) {
    console.info("Reminder dispatch is not configured: SUBSCRIBE_TEMPLATE_ID is empty.");
    return { ok: true, skipped: "template-not-configured" };
  }

  // Dispatch stays inert until the account has an approved template and the
  // reminder task state machine is implemented and reviewed.
  return { ok: true, scanned: 0 };
};
