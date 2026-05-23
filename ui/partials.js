export async function loadAssetPartials() {
	const mounts = document.querySelectorAll("[data-asset-partial]");
	await Promise.all(
		Array.from(mounts).map(async mount => {
			const url = mount.getAttribute("data-asset-partial");
			const res = await fetch(url);
			if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
			mount.innerHTML = await res.text();
		})
	);
}
