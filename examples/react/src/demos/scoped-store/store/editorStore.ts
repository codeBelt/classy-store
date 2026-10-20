export type EditorData = {
  title: string;
  body: string;
};

export class EditorStore {
  title: string;
  body: string;

  constructor(initialData: EditorData) {
    this.title = initialData.title;
    this.body = initialData.body;
  }

  setTitle(title: string) {
    this.title = title;
  }

  setBody(body: string) {
    this.body = body;
  }
}
