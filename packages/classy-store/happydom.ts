import {GlobalRegistrator} from '@happy-dom/global-registrator';

GlobalRegistrator.register();

// @ts-expect-error
global.IS_REACT_ACT_ENVIRONMENT = true;
