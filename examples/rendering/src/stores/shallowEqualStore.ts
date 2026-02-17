import {createClassyStore} from '@codebelt/classy-store';

export class ProfileStore {
  firstName = 'Alice';
  lastName = 'Smith';
  age = 30;
  email = 'alice@example.com';
  theme: 'dark' | 'light' = 'dark';
  notifications = true;

  setFirstName(name: string) {
    this.firstName = name;
  }

  setLastName(name: string) {
    this.lastName = name;
  }

  setAge(age: number) {
    this.age = age;
  }

  setEmail(email: string) {
    this.email = email;
  }

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
  }

  toggleNotifications() {
    this.notifications = !this.notifications;
  }
}

export const profileStore = createClassyStore(new ProfileStore());
