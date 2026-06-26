import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../services/api";

// ── Thunks ──────────────────────────────────────────────────────────────────

/**
 * Step 1: Create a Razorpay order on the backend.
 * Returns { orderId, amount, currency, keyId } for the frontend checkout.
 */
export const createPaymentOrder = createAsyncThunk(
  "payments/createOrder",
  async (leaseId, { rejectWithValue }) => {
    try {
      const res = await API.post("/payments/order", { leaseId });
      return res.data; // { orderId, amount, currency, keyId, effectiveAmount }
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Step 2: Verify payment signature after Razorpay checkout succeeds.
 * Marks the payment as PAID in our DB.
 */
export const verifyPayment = createAsyncThunk(
  "payments/verify",
  async (payload, { rejectWithValue }) => {
    try {
      // payload = { razorpay_order_id, razorpay_payment_id, razorpay_signature, leaseId }
      const res = await API.post("/payments/verify", payload);
      return res.data.payment;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

/**
 * Fetch the payment history for the logged-in user (tenant or landlord scope).
 */
export const fetchPaymentHistory = createAsyncThunk(
  "payments/fetchHistory",
  async (leaseId, { rejectWithValue }) => {
    try {
      const url = leaseId ? `/payments/my-payments?leaseId=${leaseId}` : "/payments/my-payments";
      const res = await API.get(url);
      return res.data.payments;
    } catch (err) {
      return rejectWithValue(err.message);
    }
  }
);

// ── Slice ────────────────────────────────────────────────────────────────────

const paymentsSlice = createSlice({
  name: "payments",
  initialState: {
    // Active order being processed (before Razorpay checkout)
    activeOrder: null,
    // Payment records (history)
    history: [],
    loading: false,
    verifying: false,
    error: null,
    // Success flag set after verify succeeds
    lastPaymentSuccess: null,
  },
  reducers: {
    clearPaymentError: (state) => {
      state.error = null;
    },
    clearActiveOrder: (state) => {
      state.activeOrder = null;
    },
    clearLastPaymentSuccess: (state) => {
      state.lastPaymentSuccess = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // createPaymentOrder
      .addCase(createPaymentOrder.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.activeOrder = null;
      })
      .addCase(createPaymentOrder.fulfilled, (state, action) => {
        state.loading = false;
        state.activeOrder = action.payload;
      })
      .addCase(createPaymentOrder.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // verifyPayment
      .addCase(verifyPayment.pending, (state) => {
        state.verifying = true;
        state.error = null;
      })
      .addCase(verifyPayment.fulfilled, (state, action) => {
        state.verifying = false;
        state.activeOrder = null;
        state.lastPaymentSuccess = action.payload;
        // Prepend to history
        state.history = [action.payload, ...state.history];
      })
      .addCase(verifyPayment.rejected, (state, action) => {
        state.verifying = false;
        state.error = action.payload;
      })

      // fetchPaymentHistory
      .addCase(fetchPaymentHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPaymentHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.history = action.payload;
      })
      .addCase(fetchPaymentHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearPaymentError, clearActiveOrder, clearLastPaymentSuccess } =
  paymentsSlice.actions;
export default paymentsSlice.reducer;
