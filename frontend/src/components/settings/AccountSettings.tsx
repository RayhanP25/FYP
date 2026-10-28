import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import * as Dialog from '@radix-ui/react-dialog';
import { Camera, Loader2 } from 'lucide-react';
import { changePassword, deleteAccount, updateProfile, uploadPicture } from '@/api/accountApi';
import { errorDetail } from '@/api/calibrationApi';
import { useAuth } from '@/hooks/useAuth';

const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const PLACEHOLDER_PICTURE = 'dummyimage.com';

const panel = 'divide-y divide-border overflow-hidden rounded-xl border border-border bg-background-main';
const input = 'h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30';
const primaryButton = 'h-8 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-text-inverse transition-opacity disabled:opacity-40';
const ghostButton = 'h-8 shrink-0 rounded-md border border-border px-3 text-sm text-text-secondary transition-colors hover:text-text disabled:opacity-40';

const initials = (name?: string) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

interface EditableRowProps {
    label: string;
    value: string;
    type?: string;
    busy: boolean;
    onSave: (value: string) => Promise<boolean>;
}

const EditableRow = ({ label, value, type = 'text', busy, onSave }: EditableRowProps) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);

    const save = async () => {
        const next = draft.trim();
        if (!next) return;
        if (next === value || (await onSave(next))) setEditing(false);
    };

    return (
        <div className="px-5 py-4">
            <div className="flex items-center justify-between gap-6">
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-muted">{label}</p>
                    {!editing && <p className="mt-0.5 truncate text-sm text-text">{value}</p>}
                </div>
                {!editing && <button onClick={() => { setDraft(value); setEditing(true); }} className={ghostButton}>Edit</button>}
            </div>
            {editing && (
                <div className="mt-3 flex items-center gap-2">
                    <input
                        autoFocus
                        type={type}
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') save();
                            if (e.key === 'Escape') setEditing(false);
                        }}
                        className={`${input} flex-1`}
                    />
                    <button onClick={() => setEditing(false)} className={ghostButton}>Cancel</button>
                    <button onClick={save} disabled={busy || !draft.trim()} className={primaryButton}>Save</button>
                </div>
            )}
        </div>
    );
};

const AccountSettings = () => {
    const { user, refreshUser, logout } = useAuth();
    const navigate = useNavigate();
    const fileRef = useRef<HTMLInputElement>(null);

    const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');

    const picture = user?.profile_picture && !user.profile_picture.includes(PLACEHOLDER_PICTURE) ? user.profile_picture : null;
    const isAdmin = user?.role === 'admin';

    const run = async (key: string, task: () => Promise<void>, fallback: string) => {
        setBusy(key);
        try {
            await task();
            await refreshUser();
            return true;
        } catch (e) {
            toast.error(errorDetail(e, fallback));
            return false;
        } finally {
            setBusy(null);
        }
    };

    const onPicture = (file?: File) => {
        if (!file) return;
        if (file.size > MAX_PICTURE_BYTES) {
            toast.error('Picture must be 5 MB or smaller');
            return;
        }
        run('picture', () => uploadPicture(file), 'Could not upload the picture');
    };

    const savePassword = async (e: FormEvent) => {
        e.preventDefault();
        if (password.next !== password.confirm) {
            toast.error('The new passwords do not match');
            return;
        }
        const saved = await run('password', () => changePassword(password.current, password.next), 'Could not change your password');
        if (saved) {
            setPassword({ current: '', next: '', confirm: '' });
            setChangingPassword(false);
        }
    };

    const confirmDelete = async () => {
        setBusy('delete');
        try {
            await deleteAccount(deletePassword);
            logout();
            navigate('/login');
        } catch (e) {
            toast.error(errorDetail(e, 'Could not delete your account'));
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="flex max-w-2xl flex-col gap-6">
            <div className="flex items-center gap-5">
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={busy === 'picture'}
                    aria-label="Change picture"
                    className="group relative h-28 w-28 shrink-0 overflow-hidden rounded-full border border-border"
                >
                    {picture ? (
                        <img src={picture} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-primary/15 text-3xl font-semibold text-primary">{initials(user?.full_name)}</span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {busy === 'picture' ? <Loader2 className="h-5 w-5 animate-spin text-white" /> : <Camera className="h-5 w-5 text-white" />}
                    </span>
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => { onPicture(e.target.files?.[0]); e.target.value = ''; }}
                />
                <div className="min-w-0">
                    <p className="truncate text-base font-medium text-text">{user?.full_name}</p>
                    <p className="mt-0.5 truncate text-sm text-text-muted">{user?.email}</p>
                    <span className="mt-2 inline-block rounded border border-border px-1.5 py-0.5 text-[11px] font-medium capitalize text-text-secondary">{user?.role}</span>
                </div>
            </div>

            <section className={panel}>
                <EditableRow
                    label="Name"
                    value={user?.full_name ?? ''}
                    busy={busy === 'name'}
                    onSave={(value) => run('name', () => updateProfile({ full_name: value }), 'Could not update your name')}
                />
                <EditableRow
                    label="Email"
                    type="email"
                    value={user?.email ?? ''}
                    busy={busy === 'email'}
                    onSave={(value) => run('email', () => updateProfile({ email: value }), 'Could not update your email')}
                />
            </section>

            <section className={panel}>
                <div className="flex items-center justify-between gap-6 px-5 py-4">
                    <div className="min-w-0">
                        <p className="text-xs text-text-muted">Password</p>
                        <p className="mt-0.5 text-sm text-text">••••••••</p>
                    </div>
                    <button onClick={() => setChangingPassword((v) => !v)} className={ghostButton}>{changingPassword ? 'Cancel' : 'Change'}</button>
                </div>
                {changingPassword && (
                    <form onSubmit={savePassword} className="flex flex-col gap-3 px-5 py-5">
                        <input
                            type="password" autoComplete="current-password" placeholder="Current password" required
                            value={password.current} onChange={(e) => setPassword({ ...password, current: e.target.value })} className={input}
                        />
                        <input
                            type="password" autoComplete="new-password" placeholder="New password" minLength={8} required
                            value={password.next} onChange={(e) => setPassword({ ...password, next: e.target.value })} className={input}
                        />
                        <input
                            type="password" autoComplete="new-password" placeholder="Confirm new password" minLength={8} required
                            value={password.confirm} onChange={(e) => setPassword({ ...password, confirm: e.target.value })} className={input}
                        />
                        <div className="flex justify-end">
                            <button type="submit" disabled={busy === 'password'} className={primaryButton}>Update password</button>
                        </div>
                    </form>
                )}
            </section>

            <section className="flex items-center justify-between gap-6 rounded-xl border border-red-500/30 px-5 py-4">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-text">Delete account</p>
                </div>
                <button
                    onClick={() => { setDeletePassword(''); setDeleteOpen(true); }}
                    disabled={isAdmin}
                    title={isAdmin ? "Admins can't delete their own account. Ask another admin." : undefined}
                    className="h-8 shrink-0 rounded-md border border-red-500/40 px-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                >
                    Delete account
                </button>
            </section>

            <Dialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-black/70" />
                    <Dialog.Content className="fixed left-1/2 top-1/2 flex w-[90vw] max-w-[420px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border border-border bg-background p-6 shadow-xl focus:outline-none">
                        <Dialog.Title className="font-semibold text-text">Delete your account?</Dialog.Title>
                        <input
                            type="password" autoComplete="current-password" placeholder="Enter your password to confirm"
                            value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className={input}
                        />
                        <div className="flex justify-end gap-2">
                            <Dialog.Close asChild>
                                <button className={ghostButton}>Cancel</button>
                            </Dialog.Close>
                            <button
                                onClick={confirmDelete}
                                disabled={!deletePassword || busy === 'delete'}
                                className="h-8 rounded-md bg-red-500 px-3 text-sm font-medium text-white transition-opacity disabled:opacity-40"
                            >
                                Delete account
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </div>
    );
};

export default AccountSettings;
