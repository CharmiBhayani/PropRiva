import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../services/api";

// Thunks
export const inviteTenant = createAsyncThunk(
  "leases/inviteTenant",
  async (inviteData, { rejectWithValue }) => {
    try {
      const response = await API.post("/lease/invite", inviteData);
      return response.data.lease; // return created lease object
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchActiveLeases = createAsyncThunk(
  "leases/fetchActiveLeases",
  async (_, { rejectWithValue }) => {
    try {
      const response = await API.get("/lease/my-leases");
      return response.data.leases; // array of active leases
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchPendingInvites = createAsyncThunk(
  "leases/fetchPendingInvites",
  async (_, { rejectWithValue }) => {
    try {
      const response = await API.get("/lease/pending");
      return response.data.invites; // array of pending invites
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const approveLease = createAsyncThunk(
  "leases/approveLease",
  async (leaseId, { rejectWithValue }) => {
    try {
      const response = await API.post(`/lease/approve/${leaseId}`);
      return response.data.lease; // updated lease
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const rejectLease = createAsyncThunk(
  "leases/rejectLease",
  async (leaseId, { rejectWithValue }) => {
    try {
      const response = await API.post(`/lease/reject/${leaseId}`);
      return response.data.lease; // updated lease
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  activeLeases: [],
  pendingInvites: [],
  loading: false,
  error: null,
  inviteSuccess: false,
};

const leasesSlice = createSlice({
  name: "leases",
  initialState,
  reducers: {
    clearLeaseError: (state) => {
      state.error = null;
    },
    clearInviteSuccess: (state) => {
      state.inviteSuccess = false;
    },
  },
  extraReducers: (builder) => {
    builder
      // Invite Tenant
      .addCase(inviteTenant.pending, (state) => {
        state.loading = true;
        state.error = null;
        state.inviteSuccess = false;
      })
      .addCase(inviteTenant.fulfilled, (state) => {
        state.loading = false;
        state.inviteSuccess = true;
      })
      .addCase(inviteTenant.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.inviteSuccess = false;
      })

      // Fetch Active Leases
      .addCase(fetchActiveLeases.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchActiveLeases.fulfilled, (state, action) => {
        state.loading = false;
        state.activeLeases = action.payload;
      })
      .addCase(fetchActiveLeases.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Pending Invites
      .addCase(fetchPendingInvites.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPendingInvites.fulfilled, (state, action) => {
        state.loading = false;
        state.pendingInvites = action.payload;
      })
      .addCase(fetchPendingInvites.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Approve Lease
      .addCase(approveLease.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(approveLease.fulfilled, (state, action) => {
        state.loading = false;
        // remove from pending list
        state.pendingInvites = state.pendingInvites.filter(
          (invite) => invite.id !== action.payload.id
        );
        // optionally add to active leases if the payload contains property
        state.activeLeases.push(action.payload);
      })
      .addCase(approveLease.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Reject Lease
      .addCase(rejectLease.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(rejectLease.fulfilled, (state, action) => {
        state.loading = false;
        // remove from pending list
        state.pendingInvites = state.pendingInvites.filter(
          (invite) => invite.id !== action.payload.id
        );
      })
      .addCase(rejectLease.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearLeaseError, clearInviteSuccess } = leasesSlice.actions;
export default leasesSlice.reducer;
