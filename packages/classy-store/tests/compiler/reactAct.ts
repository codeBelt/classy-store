import * as React from 'react';
import {act as legacyAct} from 'react-dom/test-utils';

export const act = React.act ?? legacyAct;
