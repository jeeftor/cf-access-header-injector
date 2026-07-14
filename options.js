const extension = globalThis.browser ?? globalThis.chrome;

const form = document.querySelector("#configuration-form");
const headerSetList = document.querySelector("#header-set-list");
const headerSetEmpty = document.querySelector("#header-set-empty");
const headerSetEditor = document.querySelector("#header-set-editor");
const assignmentList = document.querySelector("#site-assignment-list");
const headerSetListItemTemplate = document.querySelector("#header-set-list-item-template");
const headerSetEditorTemplate = document.querySelector("#header-set-editor-template");
const assignmentTemplate = document.querySelector("#site-assignment-template");
const headerSetDialog = document.querySelector("#header-set-dialog");
const selectedHeaderSetTitle = document.querySelector("#selected-header-set-title");
const selectedHeaderSetDescription = document.querySelector("#selected-header-set-description");
const addHeaderSetButton = document.querySelector("#add-header-set");
const closeHeaderSetDialogButton = document.querySelector("#close-header-set-dialog");
const addAssignmentButton = document.querySelector("#add-assignment");
const addTestSiteButton = document.querySelector("#add-test-site");
const forgetButton = document.querySelector("#forget");
const siteEmpty = document.querySelector("#site-empty");
const status = document.querySelector("#status");
const saveBar = document.querySelector(".save-bar");
const saveTitle = document.querySelector("#save-title");
const saveDescription = document.querySelector("#save-description");
const checkUpdateButton = document.querySelector("#check-update");
const updateStatus = document.querySelector("#update-status");
const updateLink = document.querySelector("#update-link");
const testScope = "httpbingo.org";
const testHeaderName = "X-Gimme-Sum-Headers-Test";
const testHeaderValue = "working";
const testEchoUrl = "https://httpbingo.org/headers";

let headerSets = [];
let selectedHeaderSetId = null;
let hasUnsavedChanges = false;

void restoreConfiguration();
form.addEventListener("submit", saveConfiguration);
form.addEventListener("input", () => setUnsavedChanges(true));
form.addEventListener("change", () => setUnsavedChanges(true));
addHeaderSetButton.addEventListener("click", appendHeaderSet);
closeHeaderSetDialogButton.addEventListener("click", completeHeaderSet);
headerSetDialog.addEventListener("close", closeHeaderSetDialog);
addAssignmentButton.addEventListener("click", addProtectedSite);
addTestSiteButton.addEventListener("click", addTestSite);
forgetButton.addEventListener("click", forgetConfiguration);
checkUpdateButton.addEventListener("click", checkForUpdate);

/**
 * Restores saved reusable header sets and site assignments.
 *
 * @returns {Promise<void>} A promise that resolves when the editor is rendered.
 */
async function restoreConfiguration() {
  const configuration = await sendMessage({ type: "get-options-state" });
  renderConfiguration(configuration);
}

/**
 * Checks the latest GitHub Release only after an explicit user action.
 *
 * @returns {Promise<void>} A promise that resolves after update feedback is shown.
 */
async function checkForUpdate() {
  const githubPermission = "https://api.github.com/*";
  updateLink.hidden = true;
  updateStatus.textContent = "Checking GitHub for the latest release…";

  let granted;
  try {
    granted = await extension.permissions.request({ origins: [githubPermission] });
  } catch {
    updateStatus.textContent = "GitHub permission must be requested directly from Check for update. Try again.";
    return;
  }
  if (!granted) {
    updateStatus.textContent = "GitHub access was not granted; no update check was made.";
    return;
  }

  try {
    const update = await sendMessage({ type: "check-update" });
    if (update.updateAvailable) {
      updateStatus.textContent = `Update available: v${update.latestVersion} (installed: v${update.currentVersion}).`;
      updateLink.href = update.releaseUrl;
      updateLink.hidden = false;
    } else if (update.latestVersion === update.currentVersion) {
      updateStatus.textContent = `You are on the latest GitHub release (v${update.currentVersion}).`;
    } else {
      updateStatus.textContent = `Installed v${update.currentVersion} is newer than the latest GitHub release (v${update.latestVersion}).`;
    }
  } catch {
    updateStatus.textContent = "GitHub could not check for an update. Try again later.";
  }
}

/**
 * Renders the full options form from normalized configuration data.
 *
 * @param {{headerSets?: Array<object>, siteAssignments?: Array<object>}} configuration Saved configuration.
 * @returns {void}
 */
function renderConfiguration(configuration) {
  headerSets = (configuration.headerSets ?? []).map(copyHeaderSet);
  selectedHeaderSetId = headerSets[0]?.id ?? null;

  assignmentList.replaceChildren();
  for (const assignment of configuration.siteAssignments ?? []) {
    appendAssignment(assignment);
  }
  siteEmpty.hidden = assignmentList.children.length !== 0;

  renderHeaderSetWorkspace();
  setUnsavedChanges(false);
}

/**
 * Renders the selectable header-set rail and the currently selected editor.
 *
 * @returns {void}
 */
function renderHeaderSetWorkspace() {
  renderHeaderSetList();
  renderHeaderSetEditor();
  refreshAssignmentSetChoices();
  updateAssignmentActionAvailability();
}

/**
 * Renders lightweight set names and preset metadata without exposing header values.
 *
 * @returns {void}
 */
function renderHeaderSetList() {
  headerSetList.replaceChildren();
  const visibleHeaderSets = headerSets.filter(hasName);
  headerSetEmpty.hidden = visibleHeaderSets.length !== 0;

  for (const headerSet of visibleHeaderSets) {
    const fragment = headerSetListItemTemplate.content.cloneNode(true);
    const item = fragment.querySelector(".header-set-list-item");
    const selectButton = item.querySelector(".header-set-list-select");
    const assignmentCount = assignmentCountFor(headerSet.id);

    item.dataset.selected = String(headerSet.id === selectedHeaderSetId);
    selectButton.setAttribute("aria-pressed", String(headerSet.id === selectedHeaderSetId));
    item.querySelector(".header-set-list-item-name").textContent = headerSet.name;
    item.querySelector(".header-set-list-item-meta").textContent = `${presetLabel(headerSet.kind)} · ${assignmentCount} ${pluralize("site", assignmentCount)}`;
    selectButton.addEventListener("click", () => selectHeaderSet(headerSet.id));
    const deleteButton = item.querySelector(".header-set-list-delete");
    if (assignmentCount > 0) {
      deleteButton.disabled = true;
      deleteButton.title = "Remove or reassign this set's sites first.";
    }
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteHeaderSet(headerSet.id);
    });
    headerSetList.append(item);
  }
}

/**
 * Renders the editable details for the selected reusable header set.
 *
 * @returns {void}
 */
function renderHeaderSetEditor() {
  headerSetEditor.replaceChildren();
  const headerSet = selectedHeaderSet();
  if (!headerSet) {
    selectedHeaderSetTitle.textContent = "No header set selected";
    selectedHeaderSetDescription.textContent = "Create a header set when you need a new credential.";
    headerSetEditor.textContent = "Header sets are optional until you add a protected site.";
    return;
  }

  const fragment = headerSetEditorTemplate.content.cloneNode(true);
  const element = fragment.querySelector("[data-header-set]");
  const nameInput = element.querySelector(".header-set-name");
  const kindSelect = element.querySelector(".header-set-kind");
  const presetFields = element.querySelector(".preset-fields");

  element.dataset.id = headerSet.id;
  nameInput.value = headerSet.name;
  nameInput.addEventListener("input", () => nameInput.setCustomValidity(""));
  kindSelect.value = headerSet.kind;
  renderPresetFields(presetFields, headerSet.kind, headerSet.headers);
  element.querySelector(".header-set-usage").textContent = usageLabel(headerSet.id);
  kindSelect.addEventListener("change", () => {
    renderPresetFields(presetFields, kindSelect.value, []);
    syncHeaderSetPreview();
  });
  element.addEventListener("input", syncHeaderSetPreview);

  headerSetEditor.append(element);
  updateSelectedHeaderSetHeading(headerSet);
}

/**
 * Selects one header set after preserving unsaved edits to the current set.
 *
 * @param {string} headerSetId Header-set identifier to select.
 * @returns {void}
 */
function selectHeaderSet(headerSetId) {
  captureSelectedHeaderSet();
  selectedHeaderSetId = headerSetId;
  renderHeaderSetWorkspace();
  headerSetDialog.showModal();
}

/**
 * Adds a blank header set and displays its details.
 *
 * @returns {void}
 */
function appendHeaderSet() {
  captureSelectedHeaderSet();
  const headerSet = emptyHeaderSet();
  headerSets.push(headerSet);
  selectedHeaderSetId = headerSet.id;
  renderHeaderSetWorkspace();
  setUnsavedChanges(true);
  headerSetDialog.showModal();
}

/**
 * Confirms and removes one unassigned header set.
 *
 * @param {string} headerSetId Header-set identifier to remove.
 * @returns {void}
 */
function deleteHeaderSet(headerSetId) {
  const headerSet = headerSets.find((item) => item.id === headerSetId);
  if (!headerSet) {
    return;
  }
  if (isHeaderSetReferenced(headerSet.id)) {
    setStatus("Reassign or remove every site that uses this header set first.", true);
    return;
  }
  if (!window.confirm(`Delete “${headerSet.name}”?`)) {
    return;
  }

  headerSets = headerSets.filter((item) => item.id !== headerSet.id);
  selectedHeaderSetId = headerSets[0]?.id ?? null;
  renderHeaderSetWorkspace();
  setUnsavedChanges(true);
  if (headerSetDialog.open) {
    headerSetDialog.close();
  }
}

/**
 * Preserves edits made in the dialog before it closes, including Escape dismissal.
 *
 * @returns {void}
 */
function closeHeaderSetDialog() {
  const hadEditor = Boolean(headerSetEditor.querySelector("[data-header-set]"));
  captureSelectedHeaderSet();
  if (hadEditor) {
    renderHeaderSetWorkspace();
    setUnsavedChanges(true);
  }
}

/**
 * Closes the header-set editor only after the set has a user-provided name.
 *
 * @returns {void}
 */
function completeHeaderSet() {
  const nameInput = headerSetEditor.querySelector(".header-set-name");
  if (!nameInput) {
    headerSetDialog.close();
    return;
  }

  if (!nameInput.value.trim()) {
    nameInput.setCustomValidity("Give this header set a name before continuing.");
    nameInput.reportValidity();
    nameInput.focus();
    return;
  }

  nameInput.setCustomValidity("");
  headerSetDialog.close();
}

/**
 * Copies the selected editor's current values to the in-memory draft without validation.
 *
 * @returns {void}
 */
function captureSelectedHeaderSet() {
  const element = headerSetEditor.querySelector("[data-header-set]");
  if (!element) {
    return;
  }

  const index = headerSets.findIndex((headerSet) => headerSet.id === element.dataset.id);
  if (index !== -1) {
    headerSets[index] = readHeaderSetEditor(element);
  }
}

/**
 * Updates sidebar and assignment labels while preserving focus in the editor.
 *
 * @returns {void}
 */
function syncHeaderSetPreview() {
  captureSelectedHeaderSet();
  setUnsavedChanges(true);
  const headerSet = selectedHeaderSet();
  if (headerSet) {
    updateSelectedHeaderSetHeading(headerSet);
  }
  const usage = headerSetEditor.querySelector(".header-set-usage");
  if (usage && headerSet) {
    usage.textContent = usageLabel(headerSet.id);
  }
  renderHeaderSetList();
  refreshAssignmentSetChoices();
}

/**
 * Adds one hostname-to-header-set assignment editor.
 *
 * @param {{scope?: string, headerSetId?: string, enabled?: boolean}} assignment Assignment data.
 * @returns {void}
 */
function appendAssignment(assignment = {}) {
  const fragment = assignmentTemplate.content.cloneNode(true);
  const element = fragment.querySelector("[data-site-assignment]");

  element.querySelector(".assignment-scope").value = assignment.scope ?? "";
  element.querySelector(".assignment-header-set").dataset.selectedId = assignment.headerSetId ?? "";
  element.querySelector(".assignment-enabled").checked = assignment.enabled ?? true;
  element.querySelector(".assignment-header-set").addEventListener("change", syncHeaderSetPreview);
  element.querySelector(".assignment-scope").addEventListener("input", () => updateAssignmentScopeHelp(element));
  element.querySelector(".test-headers").addEventListener("click", testHeaders);
  element.querySelector(".remove-assignment").addEventListener("click", () => {
    element.remove();
    siteEmpty.hidden = assignmentList.children.length !== 0;
    syncHeaderSetPreview();
    setUnsavedChanges(true);
  });

  assignmentList.append(element);
  siteEmpty.hidden = true;
  updateAssignmentScopeHelp(element);
  refreshAssignmentSetChoices();
}

/**
 * Adds an editable protected-site row after a header set is available.
 *
 * @returns {void}
 */
function addProtectedSite() {
  if (!headerSets.some(hasName)) {
    appendHeaderSet();
    setStatus("Create a header set first, then add the site that should use it.");
    return;
  }

  appendAssignment();
  setUnsavedChanges(true);
}

/**
 * Keeps site creation aligned with the required header-set-first workflow.
 *
 * @returns {void}
 */
function updateAssignmentActionAvailability() {
  const needsHeaderSet = !headerSets.some(hasName);
  addAssignmentButton.disabled = needsHeaderSet;
  addAssignmentButton.title = needsHeaderSet ? "Create a header set first." : "";
}

/**
 * Explains whether a mapping is an exact hostname or a wildcard default.
 *
 * @param {HTMLElement} element One site-assignment editor.
 * @returns {void}
 */
function updateAssignmentScopeHelp(element) {
  const scope = element.querySelector(".assignment-scope").value.trim();
  const help = element.querySelector(".assignment-scope-help");

  help.textContent = scope.startsWith("*.")
    ? "Wildcard default: applies to matching subdomains; exact hostnames win."
    : "Exact hostname: takes precedence over any wildcard default.";
  const testButton = element.querySelector(".test-headers");
  testButton.hidden = scope !== testScope;
  testButton.textContent = hasUnsavedChanges ? "Save & test headers" : "Test headers";
}

/**
 * Adds a safe header-echo example without sending any real credentials.
 *
 * @returns {void}
 */
function addTestSite() {
  captureSelectedHeaderSet();
  const existingAssignment = [...assignmentList.querySelectorAll("[data-site-assignment]")].find(
    (element) => element.querySelector(".assignment-scope").value.trim() === testScope,
  );

  if (existingAssignment) {
    const existingHeaderSet = headerSets.find(
      (item) => item.id === existingAssignment.querySelector(".assignment-header-set").value,
    );
    if (isTestHeaderSet(existingHeaderSet)) {
      setStatus("The safe test site is already configured. Save changes, then choose Test headers.");
    } else {
      setStatus("httpbingo.org already has a mapping. Remove it before adding the safe test site.", true);
    }
    return;
  }

  let headerSet = headerSets.find(isTestHeaderSet);

  if (!headerSet) {
    headerSet = {
      id: createIdentifier(),
      name: headerSets.some((item) => item.name === "Header check") ? "Header check (test)" : "Header check",
      kind: "custom",
      headers: [{ name: testHeaderName, value: testHeaderValue }],
    };
    headerSets.push(headerSet);
  }

  appendAssignment({ scope: testScope, headerSetId: headerSet.id, enabled: true });

  selectedHeaderSetId = headerSet.id;
  renderHeaderSetWorkspace();
  setUnsavedChanges(true);
  setStatus("Test site added. Save changes, then choose Test headers to see the injected header.");
}

/**
 * Saves pending changes first, then opens the header echo on a follow-up click.
 *
 * @returns {Promise<void>} A promise that resolves after the echo tab is opened or saving fails.
 */
async function testHeaders() {
  if (hasUnsavedChanges) {
    if (!(await saveConfiguration())) {
      return;
    }
    setStatus("Saved. Choose Test headers to open the header echo.");
    return;
  }

  const testWindow = window.open("about:blank", "_blank");
  if (!testWindow) {
    setStatus("Your browser blocked the test tab. Allow pop-ups for this extension and try again.", true);
    return;
  }

  testWindow.location.href = testEchoUrl;
  testWindow.opener = null;
}

/**
 * Determines whether a header set is the non-secret header echo example.
 *
 * @param {{kind?: string, headers?: Array<{name?: string, value?: string}>}|undefined} headerSet Header set to inspect.
 * @returns {boolean} Whether this is the built-in test header set.
 */
function isTestHeaderSet(headerSet) {
  return headerSet?.kind === "custom"
    && headerSet.headers?.length === 1
    && headerSet.headers[0].name?.toLowerCase() === testHeaderName.toLowerCase()
    && headerSet.headers[0].value === testHeaderValue;
}

/**
 * Renders the fields appropriate for a selected header-set preset.
 *
 * @param {HTMLElement} container Preset field container.
 * @param {string} kind Header-set preset kind.
 * @param {Array<object>} headers Existing header values.
 * @returns {void}
 */
function renderPresetFields(container, kind, headers) {
  container.replaceChildren();

  if (kind === "cloudflare-access") {
    const headerMap = headersByName(headers);
    container.append(
      createInputLabel("CF Access Client ID", "preset-client-id", "text", headerMap.get("cf-access-client-id") ?? ""),
      createInputLabel("CF Access Client Secret", "preset-client-secret", "password", headerMap.get("cf-access-client-secret") ?? ""),
    );
    return;
  }

  if (kind === "bearer-token") {
    const authorization = headersByName(headers).get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    container.append(createInputLabel("Bearer token", "preset-bearer-token", "password", token));
    return;
  }

  const customHeaderList = document.createElement("div");
  customHeaderList.className = "custom-header-list";
  customHeaderList.dataset.customHeaderList = "true";
  for (const header of headers.length > 0 ? headers : [{ name: "", value: "" }]) {
    appendCustomHeader(customHeaderList, header);
  }
  const addHeaderButton = document.createElement("button");
  addHeaderButton.className = "secondary";
  addHeaderButton.type = "button";
  addHeaderButton.textContent = "Add custom header";
  addHeaderButton.addEventListener("click", () => {
    appendCustomHeader(customHeaderList);
    syncHeaderSetPreview();
  });

  container.append(customHeaderList, addHeaderButton);
}

/**
 * Adds one custom header row to a header-set editor.
 *
 * @param {HTMLElement} list Custom-header row container.
 * @param {{name?: string, value?: string}} header Header data.
 * @returns {void}
 */
function appendCustomHeader(list, header = {}) {
  const row = document.createElement("div");
  row.className = "custom-header-row";
  row.dataset.customHeader = "true";
  const name = document.createElement("input");
  name.className = "custom-header-name";
  name.type = "text";
  name.autocomplete = "off";
  name.placeholder = "Header name";
  name.value = header.name ?? "";
  const value = document.createElement("input");
  value.className = "custom-header-value";
  value.type = "password";
  value.autocomplete = "new-password";
  value.placeholder = "Header value";
  value.value = header.value ?? "";
  const remove = document.createElement("button");
  remove.className = "custom-header-remove";
  remove.type = "button";
  remove.textContent = "×";
  remove.setAttribute("aria-label", "Remove custom header");
  remove.title = "Remove custom header";
  remove.addEventListener("click", () => {
    const headerName = name.value.trim() || "this custom header";
    if (!window.confirm(`Remove ${headerName}?`)) {
      return;
    }
    row.remove();
    if (list.children.length === 0) {
      appendCustomHeader(list);
    }
    syncHeaderSetPreview();
  });

  row.append(name, value, remove);
  list.append(row);
}

/**
 * Rebuilds every assignment's set selector after set additions, removals, or renames.
 *
 * @returns {void}
 */
function refreshAssignmentSetChoices() {
  const choices = readHeaderSetChoices();

  for (const select of assignmentList.querySelectorAll(".assignment-header-set")) {
    const selectedId = select.value || select.dataset.selectedId || "";
    select.replaceChildren(new Option("Choose a header set", ""));
    for (const headerSet of choices) {
      select.append(new Option(headerSet.name || "Unnamed header set", headerSet.id));
    }
    select.value = choices.some((headerSet) => headerSet.id === selectedId) ? selectedId : "";
    select.dataset.selectedId = "";
  }
}

/**
 * Saves configuration after requesting only the required enabled host permissions.
 *
 * @param {SubmitEvent} [event] Form submission event when the form was submitted directly.
 * @returns {Promise<boolean>} Whether the browser installed the saved rules.
 */
async function saveConfiguration(event) {
  event?.preventDefault();
  setStatus("");

  let configuration;
  try {
    configuration = collectConfiguration();
  } catch (error) {
    setStatus(error.message, true);
    return false;
  }

  const origins = hostPermissionsFor(configuration.siteAssignments.filter((assignment) => assignment.enabled));
  if (origins.length > 0) {
    let granted;
    try {
      granted = await extension.permissions.request({ origins });
    } catch {
      setStatus("The browser could not request host permission. Save changes directly, then try again.", true);
      return false;
    }
    if (!granted) {
      setStatus("Required host permission was not granted, so no changes were saved.", true);
      return false;
    }
  }

  try {
    const savedConfiguration = await sendMessage({ type: "save-configuration", configuration });
    renderConfiguration(savedConfiguration);
    const enabledCount = savedConfiguration.siteAssignments.filter((assignment) => assignment.enabled).length;
    setStatus(enabledCount === 0
      ? "All site assignments are disabled."
      : `Enabled ${enabledCount} ${pluralize("site", enabledCount)} with reusable header sets.`);
    return true;
  } catch {
    setStatus("The browser could not install the request-header rules. Header values were not displayed.", true);
    return false;
  }
}

/**
 * Collects and validates header sets and site assignments from the form.
 *
 * @returns {{headerSets: Array<object>, siteAssignments: Array<object>}} A normalized configuration.
 */
function collectConfiguration() {
  captureSelectedHeaderSet();
  const savedHeaderSets = headerSets.filter((headerSet) => !isBlankHeaderSet(headerSet));
  const siteAssignments = [];

  for (const element of assignmentList.querySelectorAll("[data-site-assignment]")) {
    const scope = element.querySelector(".assignment-scope").value.trim();
    const headerSetId = element.querySelector(".assignment-header-set").value;
    if (!scope && !headerSetId) {
      continue;
    }

    siteAssignments.push({
      scope,
      headerSetId,
      enabled: element.querySelector(".assignment-enabled").checked,
    });
  }

  return HeaderRules.normalizeConfiguration({ headerSets: savedHeaderSets, siteAssignments });
}

/**
 * Reads one selected editor as a raw draft so incomplete input can stay visible until Save.
 *
 * @param {HTMLElement} element Header-set editor element.
 * @returns {{id: string, name: string, kind: string, headers: Array<{name: string, value: string}>}} Header-set draft.
 */
function readHeaderSetEditor(element) {
  const kind = element.querySelector(".header-set-kind").value;
  return {
    id: element.dataset.id,
    name: element.querySelector(".header-set-name").value.trim(),
    kind,
    headers: readPresetHeaders(element, kind),
  };
}

/**
 * Reads concrete preset header pairs without validating partially completed fields.
 *
 * @param {HTMLElement} element Header-set editor element.
 * @param {string} kind Header-set preset kind.
 * @returns {Array<{name: string, value: string}>} Header pairs.
 */
function readPresetHeaders(element, kind) {
  if (kind === "cloudflare-access") {
    return [
      { name: HeaderRules.CLOUD_FLARE_CLIENT_ID, value: element.querySelector(".preset-client-id").value },
      { name: HeaderRules.CLOUD_FLARE_CLIENT_SECRET, value: element.querySelector(".preset-client-secret").value },
    ];
  }
  if (kind === "bearer-token") {
    return [{ name: "Authorization", value: `Bearer ${element.querySelector(".preset-bearer-token").value}` }];
  }

  return [...element.querySelectorAll("[data-custom-header]")].map((row) => ({
    name: row.querySelector(".custom-header-name").value,
    value: row.querySelector(".custom-header-value").value,
  }));
}

/**
 * Clears saved configuration after explicit confirmation.
 *
 * @returns {Promise<void>} A promise that resolves after the blank editor is rendered.
 */
async function forgetConfiguration() {
  await sendMessage({ type: "forget-configuration" });
  renderConfiguration({ headerSets: [], siteAssignments: [] });
  setStatus("All header sets, site assignments, rules, and site permissions were removed.");
}

/**
 * Shows whether the current form differs from what the browser is applying.
 *
 * @param {boolean} value Whether edits are pending a save.
 * @returns {void}
 */
function setUnsavedChanges(value) {
  hasUnsavedChanges = value;
  saveBar.dataset.unsaved = String(value);
  saveTitle.textContent = value ? "Unsaved changes" : "Changes applied";
  saveDescription.textContent = value
    ? "Save to apply these headers in the browser."
    : "Only enabled HTTPS hostnames receive these headers.";
  form.querySelector('button[type="submit"]').disabled = !value;

  for (const button of assignmentList.querySelectorAll(".test-headers")) {
    button.textContent = value ? "Save & test headers" : "Test headers";
  }
}

/**
 * Converts assignments to unique host permission patterns.
 *
 * @param {Array<{scope: string}>} assignments Site assignments.
 * @returns {Array<string>} Optional host permission origins.
 */
function hostPermissionsFor(assignments) {
  return [...new Set(assignments.map((assignment) => HeaderRules.normalizeScope(assignment.scope).hostPermission))];
}

/**
 * Returns lightweight header-set choices without header values.
 *
 * @returns {Array<{id: string, name: string}>} Header-set choices.
 */
function readHeaderSetChoices() {
  return headerSets.filter(hasName).map(({ id, name }) => ({ id, name }));
}

/**
 * Determines whether deleting a header set would orphan a site assignment.
 *
 * @param {string} headerSetId Header-set identifier.
 * @returns {boolean} Whether the set is selected by an assignment.
 */
function isHeaderSetReferenced(headerSetId) {
  return [...assignmentList.querySelectorAll(".assignment-header-set")].some((select) => select.value === headerSetId);
}

/**
 * Counts rendered site assignments that use a header set.
 *
 * @param {string} headerSetId Header-set identifier.
 * @returns {number} Number of assignments using the set.
 */
function assignmentCountFor(headerSetId) {
  return [...assignmentList.querySelectorAll(".assignment-header-set")]
    .filter((select) => select.value === headerSetId).length;
}

/**
 * Updates the selected-set heading without showing header values.
 *
 * @param {{id: string, name: string, kind: string}} headerSet Selected header set.
 * @returns {void}
 */
function updateSelectedHeaderSetHeading(headerSet) {
  const assignmentCount = assignmentCountFor(headerSet.id);
  selectedHeaderSetTitle.textContent = headerSet.name || "Name this header set";
  selectedHeaderSetDescription.textContent = `${presetLabel(headerSet.kind)} · ${assignmentCount} ${pluralize("site", assignmentCount)} assigned`;
}

/**
 * Returns a non-sensitive usage label for a selected header set.
 *
 * @param {string} headerSetId Header-set identifier.
 * @returns {string} Human-readable usage label.
 */
function usageLabel(headerSetId) {
  const assignmentCount = assignmentCountFor(headerSetId);
  return assignmentCount === 0
    ? "This set is not assigned to a site yet."
    : `Used by ${assignmentCount} ${pluralize("site assignment", assignmentCount)}.`;
}

/**
 * Finds the currently selected header-set draft.
 *
 * @returns {{id: string, name: string, kind: string, headers: Array<object>}|undefined} Selected draft.
 */
function selectedHeaderSet() {
  return headerSets.find((headerSet) => headerSet.id === selectedHeaderSetId);
}

/**
 * Returns the visible label for a header-set preset.
 *
 * @param {string} kind Header-set preset kind.
 * @returns {string} Preset label.
 */
function presetLabel(kind) {
  return ({
    "cloudflare-access": "Cloudflare Access",
    "bearer-token": "Bearer token",
    custom: "Custom headers",
  })[kind] ?? "Custom headers";
}

/**
 * Determines whether an untouched header-set draft can be omitted on save.
 *
 * @param {{name?: string, kind?: string, headers?: Array<object>}} headerSet Header-set draft.
 * @returns {boolean} Whether it contains no user-entered data.
 */
function isBlankHeaderSet(headerSet) {
  if (headerSet.name.trim()) {
    return false;
  }
  if (headerSet.kind === "custom") {
    return headerSet.headers.every((header) => !String(header.name ?? "").trim() && !String(header.value ?? "").trim());
  }
  return headerSet.headers.every((header) => !String(header.value ?? "").trim());
}

/**
 * Determines whether a header set can be shown or selected by name.
 *
 * @param {{name?: string}} headerSet Header-set draft.
 * @returns {boolean} Whether the draft has a non-empty user-provided name.
 */
function hasName(headerSet) {
  return Boolean(headerSet.name?.trim());
}

/**
 * Creates a visible label and form input for a preset field.
 *
 * @param {string} text Label text.
 * @param {string} className Input class name.
 * @param {string} type Input type.
 * @param {string} value Input value.
 * @returns {HTMLLabelElement} A populated label.
 */
function createInputLabel(text, className, type, value) {
  const label = document.createElement("label");
  const title = document.createElement("span");
  title.textContent = text;
  const input = document.createElement("input");
  input.className = className;
  input.type = type;
  input.autocomplete = type === "password" ? "new-password" : "off";
  input.value = value;
  label.append(title, input);
  return label;
}

/**
 * Indexes header values case-insensitively for preset rendering.
 *
 * @param {Array<object>} headers Header pairs.
 * @returns {Map<string, string>} Header values keyed by lowercase name.
 */
function headersByName(headers) {
  return new Map(headers.map((header) => [header.name.toLowerCase(), header.value]));
}

/**
 * Copies a header set so the draft never mutates browser storage data in place.
 *
 * @param {{id: string, name: string, kind: string, headers: Array<object>}} headerSet Saved header set.
 * @returns {{id: string, name: string, kind: string, headers: Array<object>}} Independent draft.
 */
function copyHeaderSet(headerSet) {
  return {
    id: headerSet.id,
    name: headerSet.name,
    kind: headerSet.kind,
    headers: headerSet.headers.map((header) => ({ name: header.name, value: header.value })),
  };
}

/**
 * Creates an empty reusable header set.
 *
 * @returns {{id: string, name: string, kind: string, headers: Array<object>}} Empty header-set data.
 */
function emptyHeaderSet() {
  return { id: createIdentifier(), name: "", kind: "cloudflare-access", headers: [] };
}

/**
 * Creates a stable browser-local identifier for a new header set.
 *
 * @returns {string} A new identifier.
 */
function createIdentifier() {
  return globalThis.crypto?.randomUUID?.() ?? `set-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Sends a message to the background configuration owner.
 *
 * @param {object} message Extension message.
 * @returns {Promise<object>} Message response.
 */
function sendMessage(message) {
  return extension.runtime.sendMessage(message);
}

/**
 * Chooses the singular or plural form of a noun.
 *
 * @param {string} noun Singular noun.
 * @param {number} count Count to describe.
 * @returns {string} Singular or plural noun.
 */
function pluralize(noun, count) {
  return count === 1 ? noun : `${noun}s`;
}

/**
 * Displays accessible success or error feedback without exposing header values.
 *
 * @param {string} message Feedback text.
 * @param {boolean} isError Whether feedback is an error.
 * @returns {void}
 */
function setStatus(message, isError = false) {
  status.textContent = message;
  status.dataset.error = String(isError);
}
