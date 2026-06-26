import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import API from "../services/api";

// Thunks
export const fetchProperties = createAsyncThunk(
  "properties/fetchProperties",
  async (_, { rejectWithValue }) => {
    try {
      const response = await API.get("/properties");
      return response.data.properties; // array of properties
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const fetchPropertyDetails = createAsyncThunk(
  "properties/fetchPropertyDetails",
  async (id, { rejectWithValue }) => {
    try {
      const response = await API.get(`/properties/${id}`);
      return response.data.property; // property object with leases/owner
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const createProperty = createAsyncThunk(
  "properties/createProperty",
  async (propertyData, { rejectWithValue }) => {
    try {
      const response = await API.post("/properties", propertyData);
      return response.data.property; // created property object
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  list: [],
  currentProperty: null,
  loading: false,
  error: null,
};

const propertiesSlice = createSlice({
  name: "properties",
  initialState,
  reducers: {
    clearPropertyError: (state) => {
      state.error = null;
    },
    clearCurrentProperty: (state) => {
      state.currentProperty = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch Properties
      .addCase(fetchProperties.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchProperties.fulfilled, (state, action) => {
        state.loading = false;
        state.list = action.payload;
      })
      .addCase(fetchProperties.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch Property Details
      .addCase(fetchPropertyDetails.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPropertyDetails.fulfilled, (state, action) => {
        state.loading = false;
        state.currentProperty = action.payload;
      })
      .addCase(fetchPropertyDetails.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Create Property
      .addCase(createProperty.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createProperty.fulfilled, (state, action) => {
        state.loading = false;
        state.list.unshift(action.payload); // Add new property to front of list
      })
      .addCase(createProperty.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { clearPropertyError, clearCurrentProperty } = propertiesSlice.actions;
export default propertiesSlice.reducer;
