import { App, Editor, MarkdownView, TFile } from "obsidian";

export interface BilingualFileSnapshot {
  file: TFile;
  path: string;
  content: string;
  diskContent: string;
  editor?: Editor;
  view?: MarkdownView;
}

/** Commit only against the source revision that was actually translated. */
export async function writeBilingualFile(
  app: App, snapshot: BilingualFileSnapshot, content: string,
  destination: "inplace" | "new_file", signal?: AbortSignal
): Promise<TFile> {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("Translation aborted by user", "AbortError");
  };
  checkCancelled();
  if (destination === "new_file") {
    const stem = snapshot.path.replace(/\.md$/i, "");
    let path = `${stem} (Bilingual).md`, suffix = 2;
    while (app.vault.getAbstractFileByPath(path)) path = `${stem} (Bilingual ${suffix++}).md`;
    checkCancelled();
    return app.vault.create(path, content);
  }

  const checkSource = () => {
    checkCancelled();
    if (snapshot.editor && snapshot.content !== snapshot.diskContent) {
      throw new Error("Bản trong editor khác bản trên đĩa. Hãy lưu và đồng bộ ghi chú trước, hoặc lưu bản dịch thành file mới.");
    }
    if (snapshot.file.path !== snapshot.path || app.vault.getAbstractFileByPath(snapshot.path) !== snapshot.file) {
      throw new Error("Ghi chú đã đổi tên, di chuyển hoặc bị xóa. Hãy dịch lại hoặc lưu thành file mới.");
    }
    if (snapshot.editor && (
      !snapshot.view || snapshot.view.file !== snapshot.file || snapshot.view.editor !== snapshot.editor ||
      snapshot.editor.getValue() !== snapshot.content
    )) {
      throw new Error("Nội dung hoặc tài liệu trong editor đã thay đổi. Hãy dịch lại hoặc lưu thành file mới.");
    }
  };
  checkSource();
  await app.vault.process(snapshot.file, current => {
    checkSource();
    if (current !== snapshot.diskContent) {
      throw new Error("Ghi chú đã thay đổi trong lúc dịch. Không ghi đè chỉnh sửa mới; hãy lưu thành file mới.");
    }
    return content;
  });
  // The pane can be recycled while the async disk write is finishing.
  if (snapshot.editor && snapshot.view?.file === snapshot.file && snapshot.view.editor === snapshot.editor &&
    snapshot.editor.getValue() === snapshot.content) snapshot.editor.setValue(content);
  return snapshot.file;
}
