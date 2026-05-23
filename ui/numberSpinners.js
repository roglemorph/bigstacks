/** Custom vertical up/down controls for quantity number inputs. */

export function bumpNumberInput(input, direction) {
	if (!input || input.disabled) return;
	const stepRaw = input.step;
	const step = stepRaw === "any" || stepRaw === "" ? 1 : parseFloat(stepRaw) || 1;
	const min = input.min !== "" && Number.isFinite(parseFloat(input.min)) ? parseFloat(input.min) : null;
	const max = input.max !== "" && Number.isFinite(parseFloat(input.max)) ? parseFloat(input.max) : null;
	let val = parseFloat(input.value);
	if (!Number.isFinite(val)) val = min != null ? min : 0;
	val += direction * step;
	if (min != null) val = Math.max(min, val);
	if (max != null) val = Math.min(max, val);
	if (Number.isInteger(step)) val = Math.round(val);
	input.value = String(val);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

function usesTradeBump(input) {
	return !!input.id && !!input.closest(".amount-stepper");
}

function spinnerBump(input, direction) {
	if (usesTradeBump(input) && typeof window._bumpAmount === "function") {
		window._bumpAmount(input.id, direction);
		return;
	}
	bumpNumberInput(input, direction);
}

export function wrapQuantityInput(input) {
	if (!input || input.type !== "number") return;
	if (input.dataset.qtySpinner === "1") return;
	if (input.disabled) return;
	if (input.closest(".qty-spinner")) return;
	if (input.closest("#page-debug")) return;

	const wrap = document.createElement("div");
	wrap.className = "qty-spinner";
	input.classList.add("qty-spinner__input");
	input.parentNode.insertBefore(wrap, input);
	wrap.appendChild(input);

	const btns = document.createElement("div");
	btns.className = "qty-spinner__btns";
	btns.innerHTML =
		'<button type="button" class="qty-spinner__btn qty-spinner__btn--up" aria-label="Increase" tabindex="-1">▲</button>' +
		'<button type="button" class="qty-spinner__btn qty-spinner__btn--down" aria-label="Decrease" tabindex="-1">▼</button>';
	wrap.appendChild(btns);

	btns.querySelector(".qty-spinner__btn--up").addEventListener("click", e => {
		e.preventDefault();
		e.stopPropagation();
		spinnerBump(input, 1);
	});
	btns.querySelector(".qty-spinner__btn--down").addEventListener("click", e => {
		e.preventDefault();
		e.stopPropagation();
		spinnerBump(input, -1);
	});

	input.dataset.qtySpinner = "1";
}

export function enhanceQuantityInputs(root = document) {
	root.querySelectorAll('input.amount-input[type="number"]:not([data-qty-spinner="1"])').forEach(wrapQuantityInput);
}
