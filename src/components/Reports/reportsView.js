// Which view the Reports screen opens on. Visual (the dashboards) is the
// landing page; a ?report=<uuid> link asks for one saved report, which lives
// in the Editor.
export const reportsViewFor = (searchParams) => (searchParams?.get('report') ? 'editor' : 'visual');
