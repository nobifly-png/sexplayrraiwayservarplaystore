const SystemSetting = require('./systemSetting.model');
const { NotFoundError, BadRequestError } = require('../../common/errors');
const { validateSettingValue, ALLOWED_SETTING_KEYS } = require('./settings.valueSchemas');
const { AUDIT_ACTION, AUDIT_ENTITY_TYPE } = require('../../common/enums');
const auditService = require('../audit/audit.service');

class SettingsService {
  async getAllSettings() {
    return await SystemSetting.find();
  }

  async getSetting(key) {
    const setting = await SystemSetting.findOne({ key });
    
    if (!setting) {
      throw new NotFoundError('Setting not found');
    }

    return setting;
  }

  async updateSetting(key, value) {
    if (!ALLOWED_SETTING_KEYS.includes(key)) {
      throw new BadRequestError(`Unknown or unsupported setting key: ${key}`);
    }
    const result = validateSettingValue(key, value);
    if (result.error) {
      throw new BadRequestError(result.error.message);
    }

    const setting = await SystemSetting.findOneAndUpdate(
      { key },
      { value: result.value },
      { new: true, upsert: true }
    );

    return setting;
  }

  async updateMultipleSettings(settings, auditCtx = {}) {
    const normalized = [];
    for (const item of settings) {
      if (!ALLOWED_SETTING_KEYS.includes(item.key)) {
        throw new BadRequestError(`Unknown or unsupported setting key: ${item.key}`);
      }
      const result = validateSettingValue(item.key, item.value);
      if (result.error) {
        throw new BadRequestError(`${item.key}: ${result.error.message}`);
      }
      normalized.push({ key: item.key, value: result.value });
    }

    const updates = normalized.map(({ key, value }) =>
      SystemSetting.findOneAndUpdate({ key }, { value }, { new: true, upsert: true })
    );
    await Promise.all(updates);

    auditService.logAction({
      userId: auditCtx.userId,
      action: AUDIT_ACTION.SETTINGS_UPDATED,
      entityType: AUDIT_ENTITY_TYPE.SYSTEM,
      metadata: { keys: normalized.map((n) => n.key) },
      ip: auditCtx.ip,
      userAgent: auditCtx.userAgent
    });

    return await this.getAllSettings();
  }
}

module.exports = new SettingsService();
