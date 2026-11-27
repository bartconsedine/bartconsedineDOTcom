import { anonymousRpc } from '@/private-apps/robot-party/anonymous-rpc';
import {createRobotApi} from '@/private-apps/robot-party/robot-api';
export const dynamic='force-dynamic';
const handle=createRobotApi(anonymousRpc);
export const GET=handle;
export const POST=handle;
