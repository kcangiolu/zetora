import { connection } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import { SidebarLayout } from '@/components/sidebar-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listUsersWithGroups } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { requireRole, roleRules, type Principal } from '@/lib/identity/principal';
import { resolveRole } from '@/lib/identity/roles';

async function requireAdminView(): Promise<Principal> {
  try {
    return await requireRole(['admin', 'auditor']);
  } catch (error) {
    if (!(error instanceof ChatSDKError)) throw error;
    if (error.type === 'unauthorized') redirect('/sign-in');
    // A member is not told the page exists.
    notFound();
  }
}

export default async function AdminPage() {
  await connection();
  await requireAdminView();
  const users = await listUsersWithGroups();

  return (
    <SidebarLayout>
      <div className="w-full min-h-dvh">
        <div className="border-b border-border/50">
          <div className="flex h-14 items-center gap-2.5 px-4 md:px-6 max-w-5xl mx-auto w-full">
            <div className="md:hidden">
              <SidebarTrigger />
            </div>
            <h1 className="text-base font-semibold tracking-tight">Administration</h1>
          </div>
        </div>
        <main className="max-w-5xl mx-auto w-full px-4 md:px-6 py-6 space-y-3">
          <div>
            <h2 className="text-sm font-medium">Users</h2>
            <p className="text-xs text-muted-foreground">
              Roles come from ZETORA_ADMIN_EMAILS, ZETORA_ADMIN_GROUPS and ZETORA_AUDITOR_GROUPS. Groups are the ones
              the identity provider sent at the user&apos;s last single sign-on.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Groups</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const role = resolveRole(user, roleRules);
                return (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={role === 'member' ? 'outline' : 'secondary'}>{role}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal text-xs text-muted-foreground">
                      {user.groups.join(', ') || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {user.createdAt.toISOString().slice(0, 10)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </main>
      </div>
    </SidebarLayout>
  );
}
