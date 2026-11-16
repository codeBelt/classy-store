import {createClassyStore} from '@codebelt/classy-store';

export class DocumentStore {
  metadata = {title: 'Untitled', author: 'Anonymous'};
  content = {
    sections: [
      {id: 1, heading: 'Introduction', body: 'Welcome to the document.'},
      {id: 2, heading: 'Methods', body: 'We used reactive proxies.'},
    ],
  };
  settings = {theme: 'dark', fontSize: 14};

  updateTitle(title: string) {
    this.metadata.title = title;
  }

  updateSectionBody(id: number, body: string) {
    const section = this.content.sections.find((state) => state.id === id);
    if (section) section.body = body;
  }

  toggleTheme() {
    this.settings.theme = this.settings.theme === 'dark' ? 'light' : 'dark';
  }
}

export const documentStore = createClassyStore(new DocumentStore());
