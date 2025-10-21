document.addEventListener('DOMContentLoaded', () => {
  const map = L.map('map', {
    center: [35.907, 139.6239],
    zoom: 16,
    scrollWheelZoom: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
  }).addTo(map);

  const stationMarker = L.circleMarker([35.9069, 139.6235], {
    radius: 10,
    color: '#0d6efd',
    weight: 2,
    fillColor: '#0d6efd',
    fillOpacity: 0.4,
  })
    .addTo(map)
    .bindTooltip('大宮駅', { permanent: true, direction: 'top', offset: [0, -10] });

  const markerLayer = L.layerGroup().addTo(map);
  const stopMarkers = new Map();
  
  const filterEast = document.getElementById('filter-east');
  const filterWest = document.getElementById('filter-west');
  const stopSelect = document.getElementById('stop-select');
  const detailsElement = document.getElementById('stop-details');
  const mapContainer = document.querySelector('.map-container');

  let activeStopId = null;

  function createMarker(stop) {
    const marker = L.marker([stop.lat, stop.lng], {
      title: stop.name,
    });

    marker.bindPopup(
      `<strong>${stop.name}</strong><br />${stop.exit === 'east' ? '東口' : '西口'} ${stop.platform}番のりば`
    );

    marker.on('click', () => {
      selectStop(stop.id, { centerOnMap: false });
    });

    return marker;
  }

  function toMinutes(timeString) {
    const [hoursRaw, minutesRaw] = timeString.split(':');
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);
    return hours * 60 + minutes;
  }

  function getNowInTokyo() {
    const now = new Date();
    const tokyoString = now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' });
    return new Date(tokyoString);
  }

  function getNextDeparture(stop) {
    const now = getNowInTokyo();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    let best = null;

    stop.services.forEach((service) => {
      service.timetable.forEach((timeString) => {
        const totalMinutes = toMinutes(timeString);
        let diff = totalMinutes - nowMinutes;
        let isNextDay = false;

        if (diff < 0) {
          diff += 24 * 60;
          isNextDay = true;
        }

        if (!best || diff < best.diff) {
          best = {
            diff,
            isNextDay: isNextDay || totalMinutes >= 24 * 60,
            timeString,
            service,
          };
        }
      });
    });

    return best;
  }

  function describeDiff(minutes, isNextDay) {
    if (minutes <= 0) {
      return 'まもなく出発';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    let text = '';

    if (hours > 0) {
      text += `${hours}時間`;
    }
    if (remainder > 0 || hours === 0) {
      text += `${remainder}分`;
    }
    text += '後';

    if (isNextDay) {
      text += '（翌日）';
    }

    return text;
  }

  function renderStopDetails(stop) {
    const next = getNextDeparture(stop);

    const serviceList = stop.services
      .map(
        (service) => `
        <li class="service-item">
          <h4>${service.operator} ${service.line}：${service.destination} 行</h4>
          <p>経由：${service.via}</p>
          <p>出発時刻：${service.timetable.join(' / ')}</p>
        </li>
      `
      )
      .join('');

    const landmarks = stop.landmarks.length
      ? `<p class="landmarks">目印：${stop.landmarks.join('・')}</p>`
      : '';

    const nextDeparture = next
      ? `<div class="next-departure">次の出発：${describeDiff(
          next.diff,
          next.isNextDay
        )}（${next.timeString} 発 / ${next.service.operator} ${next.service.line}）</div>`
      : '<div class="next-departure">本日の運行は終了しました</div>';

    detailsElement.innerHTML = `
      <h2>のりば詳細</h2>
      <div>
        <h3>${stop.name}</h3>
        <div class="badge">${stop.exit === 'east' ? '東口' : '西口'} / ${stop.platform}番</div>
        <p>${stop.description}</p>
        ${nextDeparture}
        <h4>行き先</h4>
        <ul class="service-list">${serviceList}</ul>
        ${landmarks}
      </div>
    `;
  }

  function clearSelection() {
    activeStopId = null;
    detailsElement.innerHTML = `
      <h2>のりば詳細</h2>
      <p>マップまたは一覧からのりばを選択してください。</p>
    `;
    if (stopSelect) {
      if (stopSelect.options.length > 0) {
        stopSelect.selectedIndex = 0;
      } else {
        stopSelect.value = '';
      }
    }
  }

  function selectStop(stopId, options = { centerOnMap: true }) {
    const stop = busStops.find((item) => item.id === stopId);
    if (!stop) return;

    const isVisible =
      (stop.exit === 'east' && filterEast.checked) ||
      (stop.exit === 'west' && filterWest.checked);

    if (!isVisible) {
      return;
    }

    activeStopId = stopId;

    if (stopSelect && stopSelect.value !== stopId) {
      stopSelect.value = stopId;
    }

    const marker = stopMarkers.get(stopId);
    if (marker) {
      marker.openPopup();
      if (options.centerOnMap) {
        map.flyTo([stop.lat, stop.lng], 17, { animate: true, duration: 0.8 });
      }
    }

    renderStopDetails(stop);
  }

  function updateFilters() {
    const showEast = filterEast.checked;
    const showWest = filterWest.checked;

    busStops.forEach((stop) => {
      const shouldShow = stop.exit === 'east' ? showEast : showWest;
      const marker = stopMarkers.get(stop.id);

      if (marker) {
        const hasLayer = markerLayer.hasLayer(marker);
        if (shouldShow && !hasLayer) {
          marker.addTo(markerLayer);
        } else if (!shouldShow && hasLayer) {
          markerLayer.removeLayer(marker);
        }
      }
    });

    if (activeStopId) {
      const activeStop = busStops.find((stop) => stop.id === activeStopId);
      if (activeStop) {
        const stillVisible =
          (activeStop.exit === 'east' && showEast) || (activeStop.exit === 'west' && showWest);
        if (!stillVisible) {
          clearSelection();
        }
      }
    }

    renderStopOptions();
  }

  function renderStopOptions() {
    if (!stopSelect) return;

    const showEast = filterEast.checked;
    const showWest = filterWest.checked;
    const previousValue = stopSelect.value;

    stopSelect.innerHTML = '';

    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'のりばを選択してください';
    placeholderOption.disabled = true;
    stopSelect.appendChild(placeholderOption);

    const appendGroup = (exit, label) => {
      const group = document.createElement('optgroup');
      group.label = label;

      busStops
        .filter((stop) => stop.exit === exit)
        .forEach((stop) => {
          const option = document.createElement('option');
          option.value = stop.id;
          option.textContent = stop.name;
          group.appendChild(option);
        });

      if (group.children.length > 0) {
        stopSelect.appendChild(group);
      }
    };

    if (showEast) {
      appendGroup('east', '東口');
    }
    if (showWest) {
      appendGroup('west', '西口');
    }

    const activeOption = activeStopId
      ? stopSelect.querySelector(`option[value="${activeStopId}"]`)
      : null;

    if (activeOption) {
      activeOption.selected = true;
    } else if (previousValue) {
      const previousOption = stopSelect.querySelector(`option[value="${previousValue}"]`);
      if (previousOption) {
        previousOption.selected = true;
      } else {
        placeholderOption.selected = true;
      }
    } else {
      placeholderOption.selected = true;
    }
  }

  function renderMarkers() {
    busStops.forEach((stop) => {
      const marker = createMarker(stop);
      stopMarkers.set(stop.id, marker);
      marker.addTo(markerLayer);
    });
  }

  if (stopSelect) {
    stopSelect.addEventListener('change', (event) => {
      const { value } = event.target;
      if (value) {
        selectStop(value, { centerOnMap: true });
      }
    });
  }

  filterEast.addEventListener('change', updateFilters);
  filterWest.addEventListener('change', updateFilters);

  renderMarkers();
  updateFilters();

  if (busStops.length > 0) {
    selectStop(busStops[0].id, { centerOnMap: false });
  }

  setInterval(() => {
    if (!activeStopId) return;
    const stop = busStops.find((item) => item.id === activeStopId);
    if (!stop) return;
    renderStopDetails(stop);
  }, 60000);

  map.whenReady(() => {
    map.invalidateSize();
  });

  window.addEventListener('resize', () => {
    map.invalidateSize();
  });

  if (mapContainer && 'ResizeObserver' in window) {
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(mapContainer);
  }
});
