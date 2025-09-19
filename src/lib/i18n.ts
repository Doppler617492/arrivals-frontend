type Dict = Record<string, Record<string, string>>;
const dict: Dict = {
  en: {
    user_management: 'User Management',
    add_new_user: 'Add New User',
    search_users: 'Search users…',
    filters: 'Filters',
    role: 'Role',
    status: 'Status',
    locations_csv: 'Locations (CSV)',
    created: 'Created',
    last_login: 'Last login',
    failed_logins: 'Failed logins ≥',
    reset: 'Reset',
    apply_filters: 'Apply Filters',
    bulk_actions: 'Bulk Actions',
    columns: 'Columns',
    import: 'Import',
    export_csv: 'Export CSV',
    comfortable: 'Comfortable',
    compact: 'Compact',
    showing: 'Showing',
    of: 'of',
    confirm_import: 'Confirm Import',
    dry_run_ok: 'Dry-run OK',
    rows_created: 'Rows created',
    rows_updated: 'Rows updated',
    errors: 'Errors',
    upload_csv: 'Upload CSV',
    preflight: 'Preflight',
    saved_views: 'Saved Views',
    save_view: 'Save View',
    select_view: 'Select View',
  },
};

let lang = 'en';
export function setLang(l: string) { if (dict[l]) lang = l; }
export function t(key: string) { return (dict[lang] && dict[lang][key]) || key; }

