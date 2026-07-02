import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDevelopmentUser } from "./services/devUser.js";

await mongoose.connect(env.MONGODB_URI);
await ensureDevelopmentUser();

app.listen(env.PORT, () => {
  console.log(`CodeInsight gateway listening on ${env.PORT}`);
});
