export type ShortcutGroup =
    | 'Global'
    | 'Lists & pages'
    | 'Videos'
    | 'Analysis studio'
    | 'Camera'
    | 'Calibration';

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Global', 'Lists & pages', 'Videos', 'Analysis studio', 'Camera', 'Calibration'];

export interface ShortcutDef {
    id: string;
    group: ShortcutGroup;
    label: string;
    binding: string;
}

export const SHORTCUTS = [
    { id: 'search.focus', group: 'Global', label: 'Focus the search box', binding: '/' },
    { id: 'nav.home', group: 'Global', label: 'Go to Dashboard', binding: 'tab d' },
    { id: 'nav.videos', group: 'Global', label: 'Go to Videos', binding: 'tab v' },
    { id: 'nav.analysis', group: 'Global', label: 'Go to Analysis', binding: 'tab a' },
    { id: 'nav.camera', group: 'Global', label: 'Go to Camera', binding: 'tab c' },
    { id: 'nav.groups', group: 'Global', label: 'Go to Groups', binding: 'tab g' },
    { id: 'nav.calibration', group: 'Global', label: 'Go to Calibration', binding: 'tab l' },
    { id: 'nav.users', group: 'Global', label: 'Go to Users', binding: 'tab u' },
    { id: 'nav.settings', group: 'Global', label: 'Open Settings', binding: 'tab s' },

    { id: 'list.prev', group: 'Lists & pages', label: 'Highlight the row above', binding: 'up' },
    { id: 'list.next', group: 'Lists & pages', label: 'Highlight the row below', binding: 'down' },
    { id: 'list.open', group: 'Lists & pages', label: 'Open the highlighted row', binding: 'enter' },
    { id: 'page.prev', group: 'Lists & pages', label: 'Previous page', binding: 'pageup' },
    { id: 'page.next', group: 'Lists & pages', label: 'Next page', binding: 'pagedown' },

    { id: 'videos.upload', group: 'Videos', label: 'Choose a video to upload', binding: 'u' },
    { id: 'videos.delete', group: 'Videos', label: 'Delete the highlighted video', binding: 'delete' },

    { id: 'play.toggle', group: 'Analysis studio', label: 'Play / pause', binding: 'space' },
    { id: 'play.restart', group: 'Analysis studio', label: 'Restart from the beginning', binding: 'r' },
    { id: 'frame.prev', group: 'Analysis studio', label: 'Previous frame', binding: 'left' },
    { id: 'frame.next', group: 'Analysis studio', label: 'Next frame', binding: 'right' },
    { id: 'second.prev', group: 'Analysis studio', label: 'Back 1 second', binding: 'shift+left' },
    { id: 'second.next', group: 'Analysis studio', label: 'Forward 1 second', binding: 'shift+right' },
    { id: 'frame.last', group: 'Analysis studio', label: 'Jump to the last frame', binding: 'end' },
    { id: 'edit.toggle', group: 'Analysis studio', label: 'Start / stop editing keypoints', binding: 'e' },
    { id: 'edit.done', group: 'Analysis studio', label: 'Done editing keypoints', binding: 'escape' },
    { id: 'edit.save', group: 'Analysis studio', label: 'Save keypoint edits', binding: 'ctrl+enter' },
    { id: 'edit.undo', group: 'Analysis studio', label: 'Undo keypoint edit', binding: 'ctrl+z' },
    { id: 'panel.1', group: 'Analysis studio', label: 'Show / hide Left camera', binding: '1' },
    { id: 'panel.2', group: 'Analysis studio', label: 'Show / hide Right camera', binding: '2' },
    { id: 'panel.3', group: 'Analysis studio', label: 'Show / hide 3D reconstruction', binding: '3' },
    { id: 'panel.4', group: 'Analysis studio', label: 'Show / hide Joint angles', binding: '4' },
    { id: 'panel.5', group: 'Analysis studio', label: 'Show / hide Position', binding: '5' },
    { id: 'panel.6', group: 'Analysis studio', label: 'Show / hide Velocity', binding: '6' },
    { id: 'panel.7', group: 'Analysis studio', label: 'Show / hide Distance travelled', binding: '7' },
    { id: 'layout.reset', group: 'Analysis studio', label: 'Reset layout', binding: 'alt+shift+l' },
    { id: 'sizes.reset', group: 'Analysis studio', label: 'Reset panel sizes', binding: 'alt+shift+s' },

    { id: 'camera.record', group: 'Camera', label: 'Start / stop recording', binding: 'space' },
    { id: 'calibration.capture', group: 'Calibration', label: 'Capture a pair', binding: 'space' },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export const SHORTCUT_IDS = SHORTCUTS.map((s) => s.id) as ShortcutId[];

export const groupOf = (id: ShortcutId) => SHORTCUTS.find((s) => s.id === id)!.group;
