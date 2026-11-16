import {createClassyStore} from '@codebelt/classy-store';

export class SubscribeKeyStore {
  count = 0;
  name = 'Alice';
  lastUpdated = '';

  increment() {
    this.count++;
    this.lastUpdated = new Date().toLocaleTimeString();
  }

  setName(name: string) {
    this.name = name;
    this.lastUpdated = new Date().toLocaleTimeString();
  }
}

export const subscribeKeyStore = createClassyStore(new SubscribeKeyStore());
