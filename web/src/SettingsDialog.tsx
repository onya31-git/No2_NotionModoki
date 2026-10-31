import type { ReactNode } from "react";
import type { PageFont } from "./pb";
import { ACCENTS, resetSidebarWidth, updateSettings, useSettings, type ThemePref } from "./settings";
import { Modal } from "./ui";

const FONT_OPTIONS: { value: PageFont; label: string }[] = [
  { value: "", label: "デフォルト" },
  { value: "serif", label: "セリフ" },
  { value: "mono", label: "等幅" },
];

/** Notion の「スタイル」と同じく、見本の「Ag」を並べてフォントを選ぶ */
export function FontChooser({ value, onChange }: { value: PageFont; onChange: (font: PageFont) => void }) {
  return (
    <div className="font-chooser" role="radiogroup" aria-label="フォント">
      {FONT_OPTIONS.map((f) => (
        <button
          key={f.value || "default"}
          role="radio"
          aria-checked={value === f.value}
          className={value === f.value ? "on" : ""}
          onClick={() => onChange(f.value)}
        >
          <span className={`font-sample font-${f.value || "default"}`}>Ag</span>
          <span className="font-label">{f.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch${on ? " on" : ""}`}
      onClick={() => onChange(!on)}
    />
  );
}

const THEMES: { value: ThemePref; label: string }[] = [
  { value: "system", label: "システム設定" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
];

/** アプリ全体の見た目の設定（この端末のブラウザに保存） */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const setNewPage = (patch: Partial<typeof settings.newPage>) =>
    updateSettings({ newPage: { ...settings.newPage, ...patch } });

  return (
    <Modal onClose={onClose} label="設定">
      <div className="settings">
        <header className="settings-head">
          <h2>設定</h2>
          <p>この端末のブラウザに保存されます。</p>
        </header>

        <Row title="テーマ" desc="ライト・ダーク、または OS の設定に合わせる">
          <div className="theme-chooser" role="radiogroup" aria-label="テーマ">
            {THEMES.map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={settings.theme === t.value}
                className={settings.theme === t.value ? "on" : ""}
                onClick={() => updateSettings({ theme: t.value })}
              >
                <span className={`theme-preview theme-preview-${t.value}`}>
                  <span />
                  <span />
                </span>
                {t.label}
              </button>
            ))}
          </div>
        </Row>

        <Row title="アクセントカラー" desc="ボタン・選択中の項目・リンクなどの色">
          <div className="accent-chooser" role="radiogroup" aria-label="アクセントカラー">
            {Object.entries(ACCENTS).map(([key, a]) => (
              <button
                key={key}
                role="radio"
                aria-checked={settings.accent === key}
                aria-label={a.label}
                title={a.label}
                className={settings.accent === key ? "on" : ""}
                style={{ background: a.color }}
                onClick={() => updateSettings({ accent: key })}
              />
            ))}
          </div>
        </Row>

        <Row title="サイドバーの幅" desc="サイドバーの右端をドラッグしても変えられます">
          <span className="settings-value">{settings.sidebarWidth}px</span>
          <button className="btn-secondary small" onClick={resetSidebarWidth}>
            元に戻す
          </button>
        </Row>

        <h3 className="settings-subhead">新しいページの既定スタイル</h3>
        <Row title="フォント">
          <FontChooser value={settings.newPage.font} onChange={(font) => setNewPage({ font })} />
        </Row>
        <Row title="小さい文字">
          <Switch label="小さい文字" on={settings.newPage.smallText} onChange={(smallText) => setNewPage({ smallText })} />
        </Row>
        <Row title="全幅表示">
          <Switch label="全幅表示" on={settings.newPage.fullWidth} onChange={(fullWidth) => setNewPage({ fullWidth })} />
        </Row>
      </div>
    </Modal>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-label">
        <div>{title}</div>
        {desc && <div className="settings-desc">{desc}</div>}
      </div>
      <div className="settings-control">{children}</div>
    </div>
  );
}
