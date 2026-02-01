import { httpRouter } from 'convex/server';

import { authKit } from './users/auth';

const http = httpRouter();
authKit.registerRoutes(http);
export default http;
