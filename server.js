import dotenv from 'dotenv';
import app from './server/app.js';
import { port } from './server/config/env.js';
import { isVercel } from './server/config/env.js';

dotenv.config();

if (!isVercel) {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

export default app;
