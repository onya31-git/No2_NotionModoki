import { useRef, useState, type CSSProperties } from "react";

const EMOJIS = [
  "📄", "📝", "📒", "📓", "📔", "📕", "📗", "📘", "📙", "📚", "🗂️", "📁", "📌", "📎", "🔖", "🏷️",
  "💡", "🧠", "🎯", "🚀", "⭐", "🔥", "✅", "⚙️", "🛠️", "🧪", "💻", "🖥️", "🍓", "🐧", "🌱", "🌸",
  "🍀", "🌙", "☀️", "🌈", "🎨", "🎵", "📷", "🎬", "🏠", "🏢", "✈️", "🚃", "🗺️", "💰", "📈", "📊",
  "🗓️", "⏰", "💬", "📮", "❤️", "😀", "😎", "🤔", "🙌", "🐱", "🐶", "☕", "🍙", "🍜", "🎮", "📦",
];

export const randomEmoji = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

export function EmojiPicker({ onPick, onRemove }: { onPick: (emoji: string) => void; onRemove: () => void }) {
  const [custom, setCustom] = useState("");
  return (
    <div className="emoji-picker">
      <div className="picker-head">
        <span>アイコン</span>
        <span>
          <button className="ghost-btn small" onClick={() => onPick(randomEmoji())}>ランダム</button>
          <button className="ghost-btn small" onClick={onRemove}>削除</button>
        </span>
      </div>
      <div className="emoji-grid">
        {EMOJIS.map((e) => (
          <button key={e} className="emoji-btn" onClick={() => onPick(e)}>
            {e}
          </button>
        ))}
      </div>
      {/* 一覧にない絵文字は Win + . などで入力して Enter */}
      <input
        className="picker-input"
        value={custom}
        placeholder="任意の絵文字を入力して Enter"
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing && custom.trim()) onPick(custom.trim().slice(0, 16));
        }}
      />
    </div>
  );
}

export const COVERS: Record<string, string> = {
  sunset: "linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  peach: "linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)",
  dusk: "linear-gradient(120deg, #a18cd1 0%, #fbc2eb 100%)",
  ocean: "linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)",
  forest: "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  night: "linear-gradient(120deg, #30cfd0 0%, #330867 100%)",
  ink: "linear-gradient(120deg, #434343 0%, #000000 100%)",
  sakura: "linear-gradient(120deg, #fdcbf1 0%, #e6dee9 100%)",
  red: "#e16259",
  yellow: "#f2c94c",
  green: "#4f9d76",
  blue: "#4c86c6",
};

export const randomCover = () => {
  const keys = Object.keys(COVERS);
  return keys[Math.floor(Math.random() * keys.length)];
};

/** プリセットはそのまま背景に、それ以外はアップロード画像の URL として扱う。y は画像の縦位置（%） */
export const coverStyle = (cover: string, y = 50): CSSProperties =>
  COVERS[cover]
    ? { background: COVERS[cover] }
    : { backgroundImage: `url("${encodeURI(cover)}")`, backgroundPosition: `center ${y}%` };

export function CoverPicker(props: { onPick: (cover: string) => void; onUpload: (file: File) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="cover-picker">
      <div className="picker-head">
        <span>カバー</span>
        <button className="ghost-btn small" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "アップロード中…" : "画像をアップロード"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setUploading(true);
            try {
              await props.onUpload(file);
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
      <div className="cover-grid">
        {Object.entries(COVERS).map(([key, bg]) => (
          <button key={key} className="cover-swatch" style={{ background: bg }} aria-label={key} onClick={() => props.onPick(key)} />
        ))}
      </div>
    </div>
  );
}
