// K-Hydro Track — Main Application

$(document).ready(function() {
    var plants = [];
    var currentSort = { column: 'startDate', direction: 'desc' };

    // --- Utility Functions ---
    function formatDateForDisplay(dateString) {
        if (!dateString) return 'N/A';
        var parts = dateString.split('-');
        var date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function formatDateTimeForLog(dateString) {
        if (!dateString) return 'N/A';
        var date = new Date(dateString);
        return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatDateForInput(dateString) { return dateString || getISODate(); }
    function getISODate(date) { return (date || new Date()).toISOString().split('T')[0]; }
    function getISODateTime(date) { return (date || new Date()).toISOString(); }
    function generateId() { return '_' + Math.random().toString(36).substr(2, 9); }

    // --- Data Functions ---
    function saveData() {
        plants.forEach(function(p) { if (!p.updatedAt) p.updatedAt = Date.now(); });
        KStore.writePlants(plants);
        KStore.setDarkMode($('body').hasClass('dark-mode'));
    }

    function touchPlant(plant) { plant.updatedAt = Date.now(); }

    function normalizePlants(arr) {
        arr.forEach(function(p) {
            if (!p.waterLog) p.waterLog = [];
            if (!p.harvests) p.harvests = [];
            if (!p.photos) p.photos = [];
            if (typeof p.isCompleted === 'undefined') p.isCompleted = false;
            if (typeof p.initialVolume === 'string') p.initialVolume = parseFloat(p.initialVolume);
            if (!p.updatedAt) p.updatedAt = Date.now();
            p.waterLog.forEach(function(l) { if (!l.date) l.date = getISODateTime(new Date(0)); });
            p.harvests.forEach(function(l) { if (!l.date) l.date = getISODateTime(new Date(0)); });
        });
    }

    function loadData() {
        plants = KStore.readPlants();
        normalizePlants(plants);
        if (KStore.getDarkMode()) {
            $('body').addClass('dark-mode');
            $('#darkModeToggle').text('☀️');
        }
        renderPlantTable();
        updateOverallStats();
    }

    // --- Modal Handling ---
    function openModal(modalId) { $('#' + modalId).fadeIn(200); }
    function closeModal(modalId) { $('#' + modalId).fadeOut(200); }
    $('.close-btn').on('click', function() { closeModal($(this).data('modal-id')); });
    $(window).on('click', function(event) {
        if ($(event.target).hasClass('modal')) $(event.target).fadeOut(200);
    });

    // --- Dark Mode ---
    $('#darkModeToggle').on('click', function() {
        $('body').toggleClass('dark-mode');
        $(this).text($('body').hasClass('dark-mode') ? '☀️' : '🌙');
        KStore.setDarkMode($('body').hasClass('dark-mode'));
        renderPlantTable();
    });

    // --- Plant Calculations ---
    function calculatePlantStats(plant) {
        var totalAddedWaterVolume = 0;
        var totalNutrientUnitsFromAdded = 0;
        (plant.waterLog || []).forEach(function(log) {
            var vol = parseFloat(log.volumeAdded || 0);
            var conc = parseFloat(log.nutrientConcentration || 0);
            totalAddedWaterVolume += vol;
            totalNutrientUnitsFromAdded += vol * (conc / 100);
        });
        var initialNutrientUnits = parseFloat(plant.initialVolume || 0);
        var totalNutrientVolumeEquivalent = initialNutrientUnits + totalNutrientUnitsFromAdded;
        var totalHarvestWeight = 0;
        (plant.harvests || []).forEach(function(h) { totalHarvestWeight += parseFloat(h.weight || 0); });
        return {
            totalAddedWaterVolume: totalAddedWaterVolume.toFixed(1),
            totalNutrientVolumeEquivalent: totalNutrientVolumeEquivalent.toFixed(1),
            totalHarvestWeight: totalHarvestWeight.toFixed(0)
        };
    }

    // --- Table Rendering & Sorting ---
    function renderPlantTable() {
        var tableBody = $('#plantTableBody');
        tableBody.empty();

        plants.sort(function(a, b) {
            var valA, valB;
            var statsA = calculatePlantStats(a);
            var statsB = calculatePlantStats(b);
            switch (currentSort.column) {
                case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
                case 'startDate': valA = new Date(a.startDate); valB = new Date(b.startDate); break;
                case 'initialVolume': valA = parseFloat(a.initialVolume); valB = parseFloat(b.initialVolume); break;
                case 'totalNutrientVolume': valA = parseFloat(statsA.totalNutrientVolumeEquivalent); valB = parseFloat(statsB.totalNutrientVolumeEquivalent); break;
                case 'harvest': valA = parseFloat(statsA.totalHarvestWeight); valB = parseFloat(statsB.totalHarvestWeight); break;
                case 'status': valA = a.isCompleted; valB = b.isCompleted; break;
                default: valA = a[currentSort.column]; valB = b[currentSort.column];
            }
            var cmp = 0;
            if (valA > valB) cmp = 1;
            else if (valA < valB) cmp = -1;
            return currentSort.direction === 'asc' ? cmp : cmp * -1;
        });

        $('#plantTable thead th').each(function() {
            var th = $(this);
            th.find('.sort-arrow').text(th.data('sort') === currentSort.column ? (currentSort.direction === 'asc' ? '▲' : '▼') : '');
        });

        if (plants.length === 0) {
            tableBody.html('<tr><td colspan="7" style="text-align:center; color:var(--text-color); padding:20px;">No plants yet. Get growing!</td></tr>');
        } else {
            plants.forEach(function(plant) {
                var stats = calculatePlantStats(plant);
                var statusText = plant.isCompleted ? 'Completed' : 'Active';
                var statusClass = plant.isCompleted ? 'status-completed' : 'status-active';
                tableBody.append(
                    '<tr data-id="' + plant.id + '">' +
                        '<td><input type="text" class="inline-edit plant-name-edit" value="' + plant.name + '" data-id="' + plant.id + '" title="Edit Name"></td>' +
                        '<td><input type="date" class="inline-edit plant-start-date-edit" value="' + formatDateForInput(plant.startDate) + '" data-id="' + plant.id + '" title="Edit Start Date"></td>' +
                        '<td>' + plant.initialVolume + '</td>' +
                        '<td>' + stats.totalNutrientVolumeEquivalent + '</td>' +
                        '<td>' + stats.totalHarvestWeight + '</td>' +
                        '<td class="status-cell ' + statusClass + '" data-id="' + plant.id + '" title="Click to toggle status">' + statusText + '</td>' +
                        '<td class="actions-cell">' +
                            '<button class="log-entry-btn primary" data-id="' + plant.id + '" title="Log Water/Harvest">📝 Log</button>' +
                            '<button class="details-btn" data-id="' + plant.id + '" title="View Details">ℹ️ Details</button>' +
                            '<button class="delete-plant-btn danger" data-id="' + plant.id + '" title="Delete Plant">🗑️</button>' +
                        '</td>' +
                    '</tr>'
                );
            });
        }
        updateOverallStats();
    }

    // Table header sort click
    $('#plantTable thead').on('click', 'th[data-sort]', function() {
        var col = $(this).data('sort');
        if (currentSort.column === col) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = col;
            currentSort.direction = ['startDate', 'initialVolume', 'totalNutrientVolume', 'harvest'].indexOf(col) >= 0 ? 'desc' : 'asc';
        }
        renderPlantTable();
    });

    // Inline edit: name
    $(document).on('change', '.plant-name-edit', function() {
        var id = $(this).data('id'), name = $(this).val();
        var plant = plants.find(function(p) { return p.id === id; });
        if (plant && plant.name !== name) {
            plant.name = name; touchPlant(plant); saveData();
            if (currentSort.column === 'name') renderPlantTable();
        }
    });

    // Inline edit: start date
    $(document).on('change', '.plant-start-date-edit', function() {
        var id = $(this).data('id'), date = $(this).val();
        var plant = plants.find(function(p) { return p.id === id; });
        if (plant && plant.startDate !== date) {
            plant.startDate = date; touchPlant(plant); saveData();
            if (currentSort.column === 'startDate') renderPlantTable();
        }
    });

    // Toggle status
    $(document).on('click', '.status-cell', function() {
        var self = this;
        var plant = plants.find(function(p) { return p.id === $(self).data('id'); });
        if (plant) { plant.isCompleted = !plant.isCompleted; touchPlant(plant); saveData(); renderPlantTable(); }
    });

    function updateOverallStats() {
        $('#totalPlantsStat').text(plants.length);
        var nutrient = 0, harvest = 0;
        plants.forEach(function(p) {
            var s = calculatePlantStats(p);
            nutrient += parseFloat(s.totalNutrientVolumeEquivalent);
            harvest += parseFloat(s.totalHarvestWeight);
        });
        $('#overallNutrientUsedStat').text(nutrient.toFixed(1));
        $('#overallHarvestStat').text(harvest.toFixed(0));
    }

    // --- Add Plant ---
    $('#showAddPlantModalBtn').on('click', function() {
        $('#addPlantForm')[0].reset(); $('#newStartDate').val(getISODate());
        openModal('addPlantModal'); $('#newPlantName').focus();
    });

    $('#addPlantForm').on('submit', function(e) {
        e.preventDefault();
        plants.push({
            id: generateId(), name: $('#newPlantName').val(),
            initialVolume: parseFloat($('#newInitialVolume').val()),
            startDate: $('#newStartDate').val(),
            waterLog: [], harvests: [], notes: '', photos: [],
            isCompleted: false, updatedAt: Date.now()
        });
        saveData(); renderPlantTable(); closeModal('addPlantModal');
        KUI.showToast('Plant added!', 'success');
    });

    // --- Delete Plant ---
    $(document).on('click', '.delete-plant-btn', function() {
        var id = $(this).data('id');
        var plant = plants.find(function(p) { return p.id === id; });
        if (!plant) return;
        KUI.showConfirm('Delete "' + plant.name + '" and all its data?').then(function(yes) {
            if (yes) {
                plants = plants.filter(function(p) { return p.id !== id; });
                saveData(); renderPlantTable();
                KUI.showToast('Plant deleted', 'info');
            }
        });
    });

    // --- Log Entry ---
    $(document).on('click', '.log-entry-btn', function() {
        var self = this;
        var plant = plants.find(function(p) { return p.id === $(self).data('id'); });
        if (plant) {
            $('#logEntryPlantId').val(plant.id);
            $('#logEntryModalTitle').text('Log Entry for: ' + plant.name);
            $('#logEntryForm')[0].reset();
            $('#logNutrientConcentration').val(100); $('#logNutrientConcValue').text('100%');
            openModal('logEntryModal'); $('#logWaterVolume').focus();
        }
    });

    $('#logNutrientConcentration').on('input', function() {
        $('#logNutrientConcValue').text($(this).val() + '%');
    });

    $('#logEntryForm').on('submit', function(e) {
        e.preventDefault();
        var plant = plants.find(function(p) { return p.id === $('#logEntryPlantId').val(); });
        if (!plant) return;
        var waterVol = parseFloat($('#logWaterVolume').val());
        var nutConc = parseInt($('#logNutrientConcentration').val());
        var harvestWt = parseFloat($('#logHarvestWeight').val());
        var made = false;
        var entryDate = getISODateTime();

        if (!isNaN(waterVol) && waterVol > 0) {
            plant.waterLog.push({ date: entryDate, volumeAdded: waterVol, nutrientConcentration: nutConc });
            made = true;
        }
        if (!isNaN(harvestWt) && $('#logHarvestWeight').val().trim() !== '') {
            plant.harvests.push({ date: entryDate, weight: harvestWt });
            made = true;
        }
        if (made) { touchPlant(plant); saveData(); renderPlantTable(); KUI.showToast('Entry logged!', 'success'); }
        closeModal('logEntryModal');
    });

    // --- Plant Details ---
    $(document).on('click', '.details-btn', function() {
        var self = this;
        var plant = plants.find(function(p) { return p.id === $(self).data('id'); });
        if (!plant) return;
        var stats = calculatePlantStats(plant);
        $('#detailsPlantId').val(plant.id);
        $('#detailsModalPlantName').text(plant.name);
        $('#detailsStartDate').text(formatDateForDisplay(plant.startDate));
        $('#detailsInitialVolume').text(plant.initialVolume);
        $('#detailsTotalAddedWater').text(stats.totalAddedWaterVolume);
        $('#detailsTotalNutrientVolume').text(stats.totalNutrientVolumeEquivalent);
        $('#detailsTotalHarvest').text(stats.totalHarvestWeight);
        $('#detailsNotesDisplay').text(plant.notes || 'No notes yet.');

        var photosContainer = $('#detailsPhotosContainer').empty();
        if (plant.photos && plant.photos.length > 0) {
            plant.photos.forEach(function(url) { photosContainer.append('<img src="' + url + '" alt="Plant photo">'); });
        } else {
            photosContainer.append('<p style="font-style:italic;font-size:0.9em;">No photos yet.</p>');
        }

        var logContainer = $('#detailsEntryLogContainer').empty();
        var entries = [];
        (plant.waterLog || []).forEach(function(l) { entries.push({ type: 'Water', date: l.date, volumeAdded: l.volumeAdded, nutrientConcentration: l.nutrientConcentration }); });
        (plant.harvests || []).forEach(function(l) { entries.push({ type: 'Harvest', date: l.date, weight: l.weight }); });
        entries.sort(function(a, b) { return new Date(a.date) - new Date(b.date); });

        if (entries.length > 0) {
            var ul = $('<ul></ul>');
            entries.forEach(function(entry) {
                var txt = formatDateTimeForLog(entry.date) + ': ';
                if (entry.type === 'Water') txt += 'Added ' + entry.volumeAdded + 'L water @ ' + entry.nutrientConcentration + '% nutrients.';
                else txt += 'Harvested ' + entry.weight + 'g.';
                ul.append($('<li></li>').text(txt));
            });
            logContainer.append(ul);
        } else {
            logContainer.append('<p style="font-style:italic;font-size:0.9em;">No entries logged yet.</p>');
        }
        openModal('plantDetailsModal');
    });

    // --- Notes ---
    $('#detailsEditNotesBtn').on('click', function() {
        var plant = plants.find(function(p) { return p.id === $('#detailsPlantId').val(); });
        if (plant) {
            $('#notesPlantId').val(plant.id); $('#plantNotesText').val(plant.notes);
            openModal('notesModal'); $('#plantNotesText').focus();
        }
    });

    $('#notesForm').on('submit', function(e) {
        e.preventDefault();
        var plant = plants.find(function(p) { return p.id === $('#notesPlantId').val(); });
        if (plant) {
            plant.notes = $('#plantNotesText').val(); touchPlant(plant); saveData();
            closeModal('notesModal');
            if ($('#plantDetailsModal').is(':visible') && $('#detailsPlantId').val() === plant.id) {
                $('#detailsNotesDisplay').text(plant.notes || 'No notes yet.');
            }
        }
    });

    // --- Photos ---
    $('#detailsAddPhotoBtn').on('click', function() {
        $('#photoPlantId').val($('#detailsPlantId').val());
        $('#plantPhotoFile').val(''); openModal('photoModal');
    });

    $('#photoForm').on('submit', function(e) {
        e.preventDefault();
        var plant = plants.find(function(p) { return p.id === $('#photoPlantId').val(); });
        var fileInput = document.getElementById('plantPhotoFile');
        if (plant && fileInput.files && fileInput.files[0]) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                plant.photos.push(ev.target.result); touchPlant(plant); saveData();
                closeModal('photoModal');
                if ($('#plantDetailsModal').is(':visible') && $('#detailsPlantId').val() === plant.id) {
                    var container = $('#detailsPhotosContainer');
                    if (container.find('p').length > 0 && plant.photos.length === 1) container.empty();
                    container.append('<img src="' + ev.target.result + '" alt="Plant photo">');
                }
                KUI.showToast('Photo added!', 'success');
            };
            reader.readAsDataURL(fileInput.files[0]);
        }
    });

    // --- Export ---
    $('#exportDataBtn').on('click', function() {
        if (plants.length === 0) { KUI.showToast('No data to export.', 'info'); return; }
        var dataStr = JSON.stringify(plants, null, 2);
        var dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        var name = 'k-hydro-backup-' + getISODate() + '.json';
        $('<a>', { href: dataUri, download: name })[0].click();
        KUI.showToast('Data exported!', 'success');
    });

    // --- Import ---
    $('#fileImport').on('change', function(event) {
        var file = event.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function(e) {
            try {
                var imported = JSON.parse(e.target.result);
                if (!Array.isArray(imported)) { KUI.showToast('Invalid file: not a JSON array.', 'error'); return; }
                KUI.showConfirm('Import ' + imported.length + ' plants? This will overwrite current data.').then(function(yes) {
                    if (yes) {
                        plants = imported;
                        normalizePlants(plants);
                        saveData(); renderPlantTable();
                        KUI.showToast('Data imported successfully!', 'success');
                    }
                });
            } catch (err) { KUI.showToast('Error: ' + err.message, 'error'); }
            finally { $('#fileImport').val(''); }
        };
        reader.readAsText(file);
    });

    // --- Sync Now ---
    $(document).on('click', '#syncNowBtn', function() {
        KUI.showToast('Syncing...', 'info');
        KStore.syncFromCloud().then(function(merged) {
            if (merged) {
                plants = merged;
                normalizePlants(plants);
                renderPlantTable();
                KUI.showToast('Synced!', 'success');
            } else {
                KUI.showToast('Sync failed or offline', 'error');
            }
            $('#userDropdown').removeClass('open');
        });
    });

    // --- Logout ---
    $(document).on('click', '#logoutBtn', function() {
        KUI.showConfirm('Log out? Local data will be kept.').then(function(yes) {
            if (yes) {
                KStore.clearUsername();
                $('#userDropdown').removeClass('open');
                location.reload();
            }
        });
    });

    // --- App Init ---
    function init() {
        KStore.migrateOldData();
        var username = KStore.getUsername();
        if (!username) {
            KUI.showLogin().then(function(name) {
                KStore.setUsername(name);
                KStore.initSync(name);
                KUI.initUserMenu(name);
                loadData();
                KStore.syncFromCloud().then(function(merged) {
                    if (merged) { plants = merged; normalizePlants(plants); renderPlantTable(); }
                });
            });
        } else {
            KStore.initSync(username);
            KUI.initUserMenu(username);
            loadData();
            KStore.syncFromCloud().then(function(merged) {
                if (merged) { plants = merged; normalizePlants(plants); renderPlantTable(); }
            });
        }
    }

    init();
});
