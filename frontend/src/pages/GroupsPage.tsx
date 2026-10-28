import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRightLeft, EyeOff, Pencil, Plus, Search, Trash2, UserPlus, Users, X, Check } from 'lucide-react';
import AppLayout from '../layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { addAthletesToGroup, createGroup, deleteGroup, getGroups, getMyGroup, setAthleteGroup, updateGroup, type CoachGroups, type Group, type GroupsResponse } from '@/api/groupApi';

const field = 'h-9 px-3 rounded-lg bg-background-main border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50';
const primaryBtn = 'h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg bg-primary text-white text-sm font-medium hover:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed transition';
const secondaryBtn = 'h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg border border-border bg-background-main text-sm text-text hover:bg-background transition';
const iconBtn = 'p-1.5 rounded-md text-text-muted hover:text-text hover:bg-background transition-colors disabled:opacity-40';

const SearchInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) => (
    <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${field} w-full pl-9`} />
    </div>
);

const Modal = ({ open, onClose, title, description, children, footer }: {
    open: boolean; onClose: () => void; title: string; description: string; children: ReactNode; footer?: ReactNode;
}) => (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
        <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 bg-black/70" />
            <Dialog.Content className="fixed left-1/2 top-1/2 flex max-h-[80vh] w-[90vw] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-background shadow-xl focus:outline-none">
                <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
                    <div className="min-w-0">
                        <Dialog.Title className="font-semibold text-text truncate">{title}</Dialog.Title>
                        <Dialog.Description className="mt-0.5 text-xs text-text-muted">{description}</Dialog.Description>
                    </div>
                    <Dialog.Close asChild>
                        <button className={iconBtn} title="Close"><X className="h-4 w-4" /></button>
                    </Dialog.Close>
                </div>
                <div className="min-h-0 overflow-y-auto">{children}</div>
                {footer && <div className="border-t border-border px-5 py-3">{footer}</div>}
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>
);

const matches = (text: string, query: string) => text.toLowerCase().includes(query.trim().toLowerCase());

const Avatar = ({ name, src }: { name: string; src?: string | null }) =>
    src ? (
        <img src={src} alt={name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
    ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary">
            {name.charAt(0).toUpperCase()}
        </span>
    );

const MyGroupView = () => {
    const { user } = useAuth();
    const { data, isLoading, error } = useQuery({ queryKey: ['my-group'], queryFn: getMyGroup });
    const group = data?.group;
    const sectionLabel = 'mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted';

    return (
        <AppLayout>
            <div className="h-full min-h-0 flex flex-col gap-6">
                <div>
                    <h1 className="text-2xl font-semibold text-text">My group</h1>
                    <p className="mt-1 text-sm text-text-muted">Your coach and the athletes you train with.</p>
                </div>

                {isLoading && <p className="text-text-secondary">Loading your group...</p>}
                {error && <p className="text-red-500">Error: {(error as Error).message}</p>}

                {data && !group && (
                    <section className="flex flex-col items-center gap-3 rounded-xl border border-border bg-background px-5 py-14 text-center">
                        <Users className="h-8 w-8 text-text-muted" />
                        <p className="font-medium text-text">You're not in a group yet</p>
                        <p className="text-sm text-text-muted">Your coach or an admin will add you to one.</p>
                    </section>
                )}

                {group && (
                    <section className="rounded-xl border border-border bg-background">
                        <div className="border-b border-border px-5 py-4">
                            <h2 className="font-semibold text-text">{group.name}</h2>
                            {group.members_visible && (
                                <p className="text-xs text-text-muted">{group.members.length} athlete{group.members.length === 1 ? '' : 's'}</p>
                            )}
                        </div>

                        <div className="border-b border-border px-5 py-4">
                            <p className={sectionLabel}>Coach</p>
                            {group.coach ? (
                                <div className="flex items-center gap-3">
                                    <Avatar name={group.coach.full_name} src={group.coach.profile_picture} />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-text">{group.coach.full_name}</p>
                                        <p className="truncate text-xs text-text-muted">{group.coach.email}</p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-text-muted">No coach assigned.</p>
                            )}
                        </div>

                        <div className="px-5 py-4">
                            <p className={sectionLabel}>Group members</p>
                            {group.members_visible ? (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border">
                                            <th className="py-3 pr-4 text-left font-medium text-text-secondary">Name</th>
                                            <th className="py-3 pr-4 text-left font-medium text-text-secondary">Email</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.members.map((m) => (
                                            <tr key={m.id} className="border-b border-border last:border-0 hover:bg-background-main/50 transition-colors">
                                                <td className="py-3 pr-4">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={m.full_name} src={m.profile_picture} />
                                                        <p className="font-medium text-text">{m.full_name}</p>
                                                        {m.id === user?._id && (
                                                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">You</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 pr-4 text-text-muted">{m.email}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="flex items-center gap-2 text-sm text-text-muted">
                                    <EyeOff className="h-4 w-4" /> Your coach keeps the member list private.
                                </p>
                            )}
                        </div>
                    </section>
                )}
            </div>
        </AppLayout>
    );
};

const ManageGroups = () => {
    const { isAdmin } = useAuth();
    const admin = isAdmin();
    const queryClient = useQueryClient();

    const [selectedCoachId, setSelectedCoachId] = useState('');
    const [coachSearch, setCoachSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
    const [adding, setAdding] = useState<Group | null>(null);
    const [addSearch, setAddSearch] = useState('');
    const [addSelected, setAddSelected] = useState<string[]>([]);
    const [showUnassigned, setShowUnassigned] = useState(false);
    const [unassignedSearch, setUnassignedSearch] = useState('');
    const [moving, setMoving] = useState<Group | null>(null);
    const [moveSearch, setMoveSearch] = useState('');
    const [deleting, setDeleting] = useState<Group | null>(null);

    const { data, isLoading, error } = useQuery({ queryKey: ['groups'], queryFn: getGroups });

    const act = useMutation({
        mutationFn: (request: () => Promise<unknown>) => request(),
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (e: Error) => toast.error(e.message, { theme: 'dark' }),
    });

    const toggleVisible = (group: Group) => {
        const next = !group.members_visible;
        queryClient.setQueryData<GroupsResponse>(['groups'], (d) => d && {
            ...d,
            coaches: d.coaches.map((c) => ({ ...c, groups: c.groups.map((g) => (g.id === group.id ? { ...g, members_visible: next } : g)) })),
        });
        act.mutate(() => updateGroup(group.id, { members_visible: next }));
    };

    const coaches = data?.coaches ?? [];
    const unassigned = data?.unassigned ?? [];
    const coach: CoachGroups | undefined = coaches.find((c) => c.id === selectedCoachId) ?? coaches[0];
    const visibleCoaches = coaches.filter((c) => matches(`${c.full_name} ${c.email}`, coachSearch));
    const athleteCount = coach?.groups.reduce((n, g) => n + g.athletes.length, 0) ?? 0;

    const selectCoach = (id: string) => {
        setSelectedCoachId(id);
        setCreating(false);
        setEditing(null);
    };

    const openAdd = (group: Group) => {
        setAdding(group);
        setAddSearch('');
        setAddSelected([]);
    };

    const toggleAdd = (id: string) =>
        setAddSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

    const addFiltered = unassigned.filter((a) => matches(`${a.full_name} ${a.email}`, addSearch));

    const create = () => {
        const name = newName.trim();
        if (!name || !coach) return;
        act.mutate(() => createGroup(name, admin ? coach.id : undefined), {
            onSuccess: () => {
                setNewName('');
                setCreating(false);
            },
        });
    };

    const rename = (group: Group) => {
        const name = editing?.name.trim();
        if (!name) return;
        act.mutate(() => updateGroup(group.id, { name }), { onSuccess: () => setEditing(null) });
    };

    const renderGroup = (group: Group) => (
        <div key={group.id} className="rounded-lg border border-border bg-background-main p-4">
            {editing?.id === group.id ? (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        rename(group);
                    }}
                    className="flex items-center gap-2"
                >
                    <input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ id: group.id, name: e.target.value })}
                        className={`${field} flex-1 min-w-0 bg-background`}
                    />
                    <button type="submit" title="Save" disabled={!editing.name.trim() || act.isPending} className={iconBtn}><Check className="h-4 w-4" /></button>
                    <button type="button" title="Cancel" onClick={() => setEditing(null)} className={iconBtn}><X className="h-4 w-4" /></button>
                </form>
            ) : (
                <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="font-medium text-text truncate">{group.name}</p>
                        <p className="text-xs text-text-muted">{group.athletes.length} athlete{group.athletes.length === 1 ? '' : 's'}</p>
                    </div>
                    <button
                        role="switch"
                        aria-checked={group.members_visible}
                        title="Let athletes in this group see who else is in it"
                        onClick={() => toggleVisible(group)}
                        className="mr-2 inline-flex items-center gap-2 text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
                    >
                        <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${group.members_visible ? 'bg-primary' : 'bg-border'}`}>
                            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${group.members_visible ? 'translate-x-4' : ''}`} />
                        </span>
                        Members visible
                    </button>
                    <button title="Rename" onClick={() => setEditing({ id: group.id, name: group.name })} className={iconBtn}>
                        <Pencil className="h-4 w-4" />
                    </button>
                    {admin && coaches.length > 1 && (
                        <button title="Move to another coach" onClick={() => { setMoving(group); setMoveSearch(''); }} className={iconBtn}>
                            <ArrowRightLeft className="h-4 w-4" />
                        </button>
                    )}
                    <button title="Delete group" onClick={() => setDeleting(group)} className={`${iconBtn} hover:text-red-500`}>
                        <Trash2 className="h-4 w-4" />
                    </button>
                </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {group.athletes.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-3 pr-2 text-xs text-text" title={a.email}>
                        {a.full_name}
                        <button
                            title="Remove from group"
                            disabled={act.isPending}
                            onClick={() => act.mutate(() => setAthleteGroup(a.id, null))}
                            className="rounded-full p-0.5 text-text-muted hover:text-red-500 disabled:opacity-40"
                        >
                            <X className="h-3 w-3" />
                        </button>
                    </span>
                ))}
                <button
                    onClick={() => openAdd(group)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-text-muted hover:border-primary hover:text-text transition-colors"
                >
                    <UserPlus className="h-3 w-3" /> Add athletes
                </button>
            </div>
        </div>
    );

    const groupsPanel = coach && (
        <section className="min-w-0 min-h-0 max-h-full flex flex-col rounded-xl border border-border bg-background">
            <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
                <div className="min-w-0">
                    <h2 className="font-semibold text-text truncate">{admin ? coach.full_name : 'My groups'}</h2>
                    <p className="text-xs text-text-muted truncate">
                        {admin && `${coach.email} · `}
                        {coach.groups.length} group{coach.groups.length === 1 ? '' : 's'} · {athleteCount} athlete{athleteCount === 1 ? '' : 's'}
                    </p>
                </div>
                {!creating && (
                    <button onClick={() => setCreating(true)} className={primaryBtn}>
                        <Plus className="h-4 w-4" /> New group
                    </button>
                )}
            </div>

            <div className="flex flex-col gap-3 p-5 min-h-0 overflow-y-auto no-scrollbar">
                {creating && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            create();
                        }}
                        className="flex items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-background-main p-3"
                    >
                        <input
                            autoFocus
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Group name, e.g. Sprinters"
                            className={`${field} flex-1 min-w-0 bg-background`}
                        />
                        <button type="submit" disabled={!newName.trim() || act.isPending} className={primaryBtn}>Create</button>
                        <button type="button" onClick={() => { setCreating(false); setNewName(''); }} className={secondaryBtn}>Cancel</button>
                    </form>
                )}

                {coach.groups.map(renderGroup)}

                {coach.groups.length === 0 && !creating && (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                        <Users className="h-8 w-8 text-text-muted" />
                        <p className="text-sm text-text-muted">No groups yet.</p>
                        <button onClick={() => setCreating(true)} className={secondaryBtn}>
                            <Plus className="h-4 w-4" /> Create the first group
                        </button>
                    </div>
                )}
            </div>
        </section>
    );

    return (
        <AppLayout>
            <div className="h-full min-h-0 flex flex-col gap-6">
                <div className="flex flex-wrap items-end justify-end gap-4">
                    <button onClick={() => { setShowUnassigned(true); setUnassignedSearch(''); }} className={secondaryBtn}>
                        <Users className="h-4 w-4" /> Unassigned athletes
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">{unassigned.length}</span>
                    </button>
                </div>

                {isLoading && <p className="text-text-secondary">Loading groups...</p>}
                {error && <p className="text-red-500">Error: {(error as Error).message}</p>}
                {data && coaches.length === 0 && (
                    <p className="text-sm text-text-muted">{admin ? 'No coaches yet. Add one on the Users page.' : 'Your coach account could not be found.'}</p>
                )}

                {data && coaches.length > 0 && (admin ? (
                    <div className="flex-1 min-h-0 grid items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
                        <aside className="overflow-hidden max-h-full flex flex-col rounded-xl border border-border bg-background">
                            <div className="border-b border-border p-3">
                                <SearchInput value={coachSearch} onChange={setCoachSearch} placeholder={`Search ${coaches.length} coaches`} />
                            </div>
                            <ul className="min-h-0 overflow-y-auto">
                                {visibleCoaches.map((c) => {
                                    const active = c.id === coach?.id;
                                    return (
                                        <li key={c.id}>
                                            <button
                                                onClick={() => selectCoach(c.id)}
                                                className={`w-full border-l-2 px-4 py-3 text-left transition-colors ${active ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-background-main'}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-sm font-medium text-text">{c.full_name}</span>
                                                    <span className="shrink-0 rounded-full bg-background-main px-2 py-0.5 text-xs text-text-muted">{c.groups.length}</span>
                                                </div>
                                                <p className="truncate text-xs text-text-muted">{c.email}</p>
                                            </button>
                                        </li>
                                    );
                                })}
                                {visibleCoaches.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-muted">No coaches found</li>}
                            </ul>
                        </aside>
                        {groupsPanel}
                    </div>
                ) : groupsPanel)}
            </div>

            <Modal
                open={showUnassigned}
                onClose={() => setShowUnassigned(false)}
                title="Unassigned athletes"
                description="Athletes with no group. Open a group and choose Add athletes to place them."
            >
                <div className="border-b border-border p-3">
                    <SearchInput value={unassignedSearch} onChange={setUnassignedSearch} placeholder="Search athletes" />
                </div>
                <ul className="divide-y divide-border">
                    {unassigned.filter((a) => matches(`${a.full_name} ${a.email}`, unassignedSearch)).map((a) => (
                        <li key={a.id} className="px-5 py-3">
                            <p className="truncate text-sm font-medium text-text">{a.full_name}</p>
                            <p className="truncate text-xs text-text-muted">{a.email}</p>
                        </li>
                    ))}
                    {unassigned.length === 0 && <li className="px-5 py-8 text-center text-sm text-text-muted">Every athlete is in a group.</li>}
                </ul>
            </Modal>

            <Modal
                open={!!adding}
                onClose={() => setAdding(null)}
                title={adding ? `Add athletes to "${adding.name}"` : ''}
                description="Search the athletes who are not in a group and tick the ones to add."
                footer={
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-text-muted">
                            {addSelected.length ? `${addSelected.length} selected` : `${unassigned.length} unassigned athlete${unassigned.length === 1 ? '' : 's'}`}
                        </span>
                        <div className="flex gap-2">
                            <button onClick={() => setAdding(null)} className={secondaryBtn}>Cancel</button>
                            <button
                                disabled={!addSelected.length || act.isPending}
                                onClick={() => adding && act.mutate(() => addAthletesToGroup(adding.id, addSelected), { onSuccess: () => setAdding(null) })}
                                className={primaryBtn}
                            >
                                Add {addSelected.length || ''}
                            </button>
                        </div>
                    </div>
                }
            >
                <div className="sticky top-0 z-10 border-b border-border bg-background p-3">
                    <SearchInput value={addSearch} onChange={setAddSearch} placeholder="Search by name or email" />
                </div>
                <ul className="divide-y divide-border">
                    {addFiltered.map((a) => {
                        const checked = addSelected.includes(a.id);
                        return (
                            <li key={a.id}>
                                <label className={`flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors ${checked ? 'bg-primary/10' : 'hover:bg-background-main'}`}>
                                    <input type="checkbox" checked={checked} onChange={() => toggleAdd(a.id)} className="h-4 w-4 accent-primary" />
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium text-text">{a.full_name}</p>
                                        <p className="truncate text-xs text-text-muted">{a.email}</p>
                                    </div>
                                </label>
                            </li>
                        );
                    })}
                    {addFiltered.length === 0 && (
                        <li className="px-5 py-8 text-center text-sm text-text-muted">
                            {unassigned.length ? 'No athletes match your search.' : 'Every athlete is already in a group.'}
                        </li>
                    )}
                </ul>
            </Modal>

            <Modal
                open={!!moving}
                onClose={() => setMoving(null)}
                title={moving ? `Move "${moving.name}"` : ''}
                description="Pick the coach this group should belong to. Its athletes move with it."
            >
                <div className="border-b border-border p-3">
                    <SearchInput value={moveSearch} onChange={setMoveSearch} placeholder="Search coaches" />
                </div>
                <ul className="divide-y divide-border">
                    {coaches.filter((c) => c.id !== moving?.coach_id && matches(`${c.full_name} ${c.email}`, moveSearch)).map((c) => (
                        <li key={c.id}>
                            <button
                                disabled={act.isPending}
                                onClick={() => moving && act.mutate(() => updateGroup(moving.id, { coach_id: c.id }), { onSuccess: () => setMoving(null) })}
                                className="w-full px-5 py-3 text-left hover:bg-background-main transition-colors disabled:opacity-50"
                            >
                                <p className="truncate text-sm font-medium text-text">{c.full_name}</p>
                                <p className="truncate text-xs text-text-muted">{c.email}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            </Modal>

            <Modal
                open={!!deleting}
                onClose={() => setDeleting(null)}
                title={deleting ? `Delete "${deleting.name}"?` : ''}
                description="Its athletes become unassigned. Their videos are not deleted."
            >
                <div className="flex justify-end gap-2 px-5 py-4">
                    <button onClick={() => setDeleting(null)} className={secondaryBtn}>Cancel</button>
                    <button
                        disabled={act.isPending}
                        onClick={() => deleting && act.mutate(() => deleteGroup(deleting.id), { onSuccess: () => setDeleting(null) })}
                        className={`${primaryBtn} bg-red-500`}
                    >
                        Delete group
                    </button>
                </div>
            </Modal>
        </AppLayout>
    );
};

const GroupsPage = () => {
    const { isAthlete } = useAuth();
    return isAthlete() ? <MyGroupView /> : <ManageGroups />;
};

export default GroupsPage;
