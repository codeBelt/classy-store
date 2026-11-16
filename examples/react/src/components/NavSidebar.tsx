import {navGroups} from './exampleNavigation';

export function NavSidebar({
  route,
  query,
  onClose,
}: {
  route: string;
  query: string;
  onClose: () => void;
}) {
  const term = query.trim().toLowerCase();
  const groups = navGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      `${item.label} ${group.label}`.toLowerCase().includes(term),
    ),
  }));
  return (
    <nav aria-label="Example navigation" className="example-nav">
      {groups.map(
        (group) =>
          group.items.length > 0 && (
            <section key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={route === item.route ? 'page' : undefined}
                >
                  {item.label}
                </a>
              ))}
            </section>
          ),
      )}
      {groups.every((group) => group.items.length === 0) && (
        <p>No matching examples.</p>
      )}
    </nav>
  );
}
