import {checkAppAccess} from '@/lib/auth';
import {authConfig} from '@/lib/auth-config';
import {createRobotsApi} from '@/private-apps/robot-party/robots-api';
import {robotsStorage} from '@/private-apps/robot-party/robots-storage';
export const dynamic='force-dynamic';
const handle=createRobotsApi({authorize:owner=>checkAppAccess('robot-party',owner),storage:robotsStorage,siteOrigin:()=>authConfig()?.siteUrl});
export const GET=handle;
export const POST=handle;
