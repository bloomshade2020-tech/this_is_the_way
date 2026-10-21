/* LOCAL fallback entry. Retains the same class name, binding, schema and receive/ACK protocol. */
import app from './index.js';
import {VectorNotificationCoordinator as Coordinator} from './coordinator.js';
export class VectorNotificationCoordinator extends Coordinator {
 rolloutMode(){return 'fallback-stop';}
}
export default app;
