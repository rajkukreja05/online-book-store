require('"'"'dotenv'"'"').config();
const mongoose = require('"'"'mongoose'"'"');
const User = require('"'"'./models/User'"'"');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || '"'"'mongodb://localhost:27017/bookstore'"'"');
  const email = '"'"'d2024.raj.kukreja@ves.ac.in'"'"';
  const u = await User.findOneAndUpdate({ email }, { $set: { role: '"'"'admin'"'"' } }, { new: true });
  if (!u) {
    console.log('"'"'user_not_found'"'"');
  } else {
    console.log('"'"'email'"'"', u.email);
    console.log('"'"'role'"'"', u.role);
    console.log('"'"'id'"'"', String(u._id));
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(e);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
