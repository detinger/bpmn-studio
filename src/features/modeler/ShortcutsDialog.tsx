import { Modal } from '../../components/ui';

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl/⌘ + Z', 'Undo'],
  ['Ctrl/⌘ + Shift + Z, Ctrl + Y', 'Redo'],
  ['Ctrl/⌘ + S', 'Save now (autosave is always on)'],
  ['Ctrl/⌘ + A', 'Select all'],
  ['Ctrl/⌘ + C / V', 'Copy / paste'],
  ['Delete / Backspace', 'Remove selected elements'],
  ['E', 'Edit label of the selected element'],
  ['H', 'Hand tool (pan)'],
  ['L', 'Lasso tool (select)'],
  ['S', 'Space tool (create/remove space)'],
  ['C', 'Global connect tool'],
  ['R', 'Replace selected element (change type)'],
  ['A', 'Append element to the selection'],
  ['Arrow keys', 'Move selected elements'],
  ['Ctrl/⌘ + scroll', 'Zoom'],
  ['T', 'Toggle token simulation'],
  ['Space', 'Play / pause the token simulation'],
  ['Alt + V', 'Open the Issues panel'],
  ['?', 'Show this help']
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={560}>
      <p className="muted">Canvas shortcuts work when the canvas has focus (click on an empty area of the diagram first).</p>
      <table className="table">
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}>
              <td style={{ width: 220 }}>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
