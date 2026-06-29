require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const SystemSetting = require('./src/modules/settings/systemSetting.model');
  await SystemSetting.findOneAndUpdate(
    { key: 'earningsPerValidView' },
    { value: 0.13 },
    { upsert: true, new: true }
  );
  const s = await SystemSetting.findOne({ key: 'earningsPerValidView' });
  console.log('Updated! earningsPerValidView =', s.value);
  await mongoose.disconnect();
}).catch(e => console.error(e));
