export type ShortcutGroup =
    | 'Global'
    | 'Lists & pages'
    | 'Videos'
    | 'Analysis studio'
    | 'Camera'
    | 'Calibration';

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['Global', 'Lists & pages', 'Videos', 'Analysis studio', 'Camera', 'Calibration'];

export type Role = 'admin' | 'coach' | 'athlete';

const EVERYONE: Role[] = ['admin', 'coach', 'athlete'];
const STAFF: Role[] = ['admin', 'coach'];
const ADMIN: Role[] = ['admin'];

export interface ShortcutDef {
    id: string;
    group: ShortcutGroup;
    label: string;
    binding: string;
    roles: Role[];
}

export const SHORTCUTS = [
    { id: 'search.focus', group: 'Global', label: 'Focus the search box', binding: '/', roles: EVERYONE },
    { id: 'nav.home', group: 'Global', label: 'Go to Dashboard', binding: 'tab d', roles: EVERYONE },
    { id: 'nav.videos', group: 'Global', label: 'Go to Videos', binding: 'tab v', roles: EVERYONE },
    { id: 'nav.analysis', group: 'Global', label: 'Go to Analysis', binding: 'tab a', roles: EVERYONE },
    { id: 'nav.camera', group: 'Global', label: 'Go to Camera', binding: 'tab c', roles: EVERYONE },
    { id: 'nav.groups', group: 'Global', label: 'Go to Groups', binding: 'tab g', roles: EVERYONE },
    { id: 'nav.calibration', group: 'Global', label: 'Go to Calibration', binding: 'tab l', roles: ADMIN },
    { id: 'nav.users', group: 'Global', label: 'Go to Users', binding: 'tab u', roles: ADMIN },
    { id: 'nav.settings', group: 'Global', label: 'Open Settings', binding: 'tab s', roles: EVERYONE },
    { id: 'nav.manual', group: 'Global', label: 'Open the User manual', binding: 'tab m', roles: EVERYONE },

    { id: 'list.prev', group: 'Lists & pages', label: 'Highlight the row above', binding: 'up', roles: EVERYONE },
    { id: 'list.next', group: 'Lists & pages', label: 'Highlight the row below', binding: 'down', roles: EVERYONE },
    { id: 'list.open', group: 'Lists & pages', label: 'Open the highlighted row', binding: 'enter', roles: EVERYONE },
    { id: 'page.prev', group: 'Lists & pages', label: 'Previous page', binding: 'pageup', roles: EVERYONE },
    { id: 'page.next', group: 'Lists & pages', label: 'Next page', binding: 'pagedown', roles: EVERYONE },

    { id: 'videos.upload', group: 'Videos', label: 'Choose a video to upload', binding: 'u', roles: EVERYONE },
    { id: 'videos.delete', group: 'Videos', label: 'Delete the highlighted video', binding: 'delete', roles: EVERYONE },

    { id: 'play.toggle', group: 'Analysis studio', label: 'Play / pause', binding: 'space', roles: EVERYONE },
    { id: 'play.restart', group: 'Analysis studio', label: 'Restart from the beginning', binding: 'r', roles: EVERYONE },
    { id: 'frame.prev', group: 'Analysis studio', label: 'Previous frame', binding: 'left', roles: EVERYONE },
    { id: 'frame.next', group: 'Analysis studio', label: 'Next frame', binding: 'right', roles: EVERYONE },
    { id: 'second.prev', group: 'Analysis studio', label: 'Back 1 second', binding: 'shift+left', roles: EVERYONE },
    { id: 'second.next', group: 'Analysis studio', label: 'Forward 1 second', binding: 'shift+right', roles: EVERYONE },
    { id: 'frame.last', group: 'Analysis studio', label: 'Jump to the last frame', binding: 'end', roles: EVERYONE },
    { id: 'edit.toggle', group: 'Analysis studio', label: 'Start / stop editing keypoints', binding: 'e', roles: STAFF },
    { id: 'edit.done', group: 'Analysis studio', label: 'Done editing keypoints', binding: 'escape', roles: STAFF },
    { id: 'edit.save', group: 'Analysis studio', label: 'Save keypoint edits', binding: 'ctrl+enter', roles: STAFF },
    { id: 'edit.undo', group: 'Analysis studio', label: 'Undo keypoint edit', binding: 'ctrl+z', roles: STAFF },
    { id: 'panel.1', group: 'Analysis studio', label: 'Show / hide Left camera', binding: '1', roles: EVERYONE },
    { id: 'panel.2', group: 'Analysis studio', label: 'Show / hide Right camera', binding: '2', roles: EVERYONE },
    { id: 'panel.3', group: 'Analysis studio', label: 'Show / hide 3D reconstruction', binding: '3', roles: EVERYONE },
    { id: 'panel.4', group: 'Analysis studio', label: 'Show / hide Joint angles', binding: '4', roles: EVERYONE },
    { id: 'panel.5', group: 'Analysis studio', label: 'Show / hide Position', binding: '5', roles: EVERYONE },
    { id: 'panel.6', group: 'Analysis studio', label: 'Show / hide Velocity', binding: '6', roles: EVERYONE },
    { id: 'panel.7', group: 'Analysis studio', label: 'Show / hide Distance travelled', binding: '7', roles: EVERYONE },
    { id: 'layout.reset', group: 'Analysis studio', label: 'Reset layout', binding: 'alt+shift+l', roles: EVERYONE },
    { id: 'sizes.reset', group: 'Analysis studio', label: 'Reset panel sizes', binding: 'alt+shift+s', roles: EVERYONE },

    { id: 'camera.record', group: 'Camera', label: 'Start / stop recording', binding: 'space', roles: EVERYONE },
    { id: 'calibration.capture', group: 'Calibration', label: 'Capture a pair', binding: 'space', roles: ADMIN },
] as const satisfies readonly ShortcutDef[];

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

export const SHORTCUT_IDS = SHORTCUTS.map((s) => s.id) as ShortcutId[];

export const groupOf = (id: ShortcutId) => SHORTCUTS.find((s) => s.id === id)!.group;

export const allowedFor = (id: ShortcutId, role?: string) =>
    !!role && (SHORTCUTS.find((s) => s.id === id)!.roles as readonly string[]).includes(role);
