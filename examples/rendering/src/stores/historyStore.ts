import {createClassyStore} from '@codebelt/classy-store';
import {withHistory} from '@codebelt/classy-store/utils';

export class TextEditorStore {
  title = 'Untitled Document';
  content = 'Start typing here...';

  setTitle(title: string) {
    this.title = title;
  }

  setContent(content: string) {
    this.content = content;
  }

  reset() {
    this.title = 'Untitled Document';
    this.content = 'Start typing here...';
  }
}

export const textEditorStore = createClassyStore(new TextEditorStore());

export const history = withHistory(textEditorStore, {limit: 50});
