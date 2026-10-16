import { useState, useEffect, useCallback } from 'react';
import { zendeskApi } from '../../services/api/zendeskApi';
import { useNotification } from '../../context/NotificationContext';
import { ZENDESK_TICKET_SUBMITTED } from '../../services/zendeskWidget';

/**
 * Custom hook for Tickets management
 * Handles business logic for ticket CRUD operations with table pattern and filters
 */
// `enabled` false (a portal user session): the tickets API is account-only.
export const useTickets = ({ enabled = true } = {}) => {
  // State management
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketComments, setTicketComments] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailViewOpen, setDetailViewOpen] = useState(false);

  // Ticket stats
  const [ticketStats, setTicketStats] = useState({
    new: 0,
    open: 0,
    pending: 0,
    hold: 0,
    solved: 0,
    closed: 0,
    total: 0,
  });

  // Pagination and sorting
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Filters
  const [filters, setFilters] = useState({
    status: '',
    priority: '',
    search: '',
  });

  // Context hooks
  const { showSuccess, showError } = useNotification();

  /**
   * Fetch ticket statistics
   */
  const fetchTicketStats = useCallback(async () => {
    try {
      const stats = await zendeskApi.getTicketStats();
      setTicketStats(stats);
    } catch (error) {
      console.error('Error fetching ticket stats:', error);
      // Don't show error - stats are non-critical
    }
  }, []);

  /**
   * Fetch tickets from API with filters, pagination, and sorting
   */
  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);

      // If there's a search query, use the search endpoint
      if (filters.search) {
        const searchResults = await zendeskApi.searchTickets(filters.search);
        setTickets(searchResults.results || []);
        setTotalCount(searchResults.count || 0);
        return;
      }

      const params = {
        page: page + 1, // API is 1-indexed
        per_page: rowsPerPage,
        sort_by: sortBy,
        sort_order: sortOrder,
      };

      // Add status filter if provided
      if (filters.status) {
        params.status = filters.status;
      }

      // Add priority filter if provided
      if (filters.priority) {
        params.priority = filters.priority;
      }

      const response = await zendeskApi.getTickets(params);

      setTickets(response.tickets || []);
      setTotalCount(response.count || response.tickets?.length || 0);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      showError('Failed to load tickets');
      setTickets([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, sortBy, sortOrder, filters, showError]);

  /**
   * Fetch single ticket with conversations (resolved author names)
   */
  const fetchTicketDetails = useCallback(async (ticketId) => {
    try {
      setLoading(true);
      const [ticketData, conversationsData] = await Promise.all([
        zendeskApi.getTicket(ticketId),
        zendeskApi.getTicketConversations(ticketId).catch(() => null),
      ]);

      if (ticketData) {
        setSelectedTicket(ticketData.ticket || ticketData);
        // Prefer conversations endpoint (has resolved author names) over embedded comments
        if (conversationsData?.conversations) {
          setTicketComments(conversationsData.conversations);
        } else {
          setTicketComments(ticketData.comments || []);
        }
      }

      return ticketData;
    } catch (error) {
      console.error('Error fetching ticket details:', error);
      showError('Failed to load ticket details');
      return null;
    } finally {
      setLoading(false);
    }
  }, [showError]);

  /**
   * Load tickets and stats on component mount and when dependencies change
   */
  useEffect(() => {
    if (!enabled) return;
    fetchTickets();
    fetchTicketStats();
  }, [enabled, fetchTickets, fetchTicketStats]);

  /**
   * Handle opening create dialog
   */
  const handleOpenDialog = useCallback(() => {
    setSelectedTicket(null);
    setDialogOpen(true);
  }, []);

  /**
   * Handle closing create dialog
   */
  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setSelectedTicket(null);
  }, []);

  /**
   * Handle creating a new ticket
   */
  const handleCreateTicket = useCallback(async (ticketData) => {
    try {
      setLoading(true);
      await zendeskApi.createTicket(ticketData);
      showSuccess('Ticket created successfully');
      handleCloseDialog();
      await fetchTickets();
      await fetchTicketStats();
    } catch (error) {
      console.error('Error creating ticket:', error);
      const errorMessage = error.message || 'Failed to create ticket';
      showError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [showSuccess, showError, fetchTickets, fetchTicketStats, handleCloseDialog]);

  /**
   * Handle updating ticket status or priority
   */
  const handleUpdateTicket = useCallback(async (ticketId, updateData) => {
    try {
      setLoading(true);
      await zendeskApi.updateTicket(ticketId, updateData);
      showSuccess('Ticket updated successfully');

      // Refresh ticket details if viewing
      if (selectedTicket && selectedTicket.id === ticketId) {
        await fetchTicketDetails(ticketId);
      }

      await fetchTickets();
      await fetchTicketStats();
    } catch (error) {
      console.error('Error updating ticket:', error);
      const errorMessage = error.message || 'Failed to update ticket';
      showError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [selectedTicket, showSuccess, showError, fetchTickets, fetchTicketStats, fetchTicketDetails]);

  /**
   * Handle adding a comment to a ticket
   */
  const handleAddComment = useCallback(async (ticketId, commentBody, isPublic = true) => {
    try {
      setLoading(true);
      await zendeskApi.addTicketConversation(ticketId, { body: commentBody, public: isPublic });
      showSuccess('Reply added successfully');

      // Refresh ticket details to show new comment
      await fetchTicketDetails(ticketId);
    } catch (error) {
      console.error('Error adding comment:', error);
      const errorMessage = error.message || 'Failed to add reply';
      showError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [showSuccess, showError, fetchTicketDetails]);

  /**
   * Handle opening ticket detail view
   */
  const handleOpenDetailView = useCallback(async (ticket) => {
    setDetailViewOpen(true);
    await fetchTicketDetails(ticket.id);
  }, [fetchTicketDetails]);

  /**
   * Handle closing ticket detail view
   */
  const handleCloseDetailView = useCallback(() => {
    setDetailViewOpen(false);
    setSelectedTicket(null);
    setTicketComments([]);
  }, []);

  /**
   * Handle page change
   */
  const handlePageChange = useCallback((event, newPage) => {
    setPage(newPage);
  }, []);

  /**
   * Handle rows per page change
   */
  const handleRowsPerPageChange = useCallback((event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  }, []);

  /**
   * Handle sort change
   */
  const handleSortChange = useCallback((field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(0);
  }, [sortBy, sortOrder]);

  /**
   * Handle filter changes
   */
  const handleFiltersChange = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPage(0); // Reset to first page on filter change
  }, []);

  /**
   * Reset all filters
   */
  const handleResetFilters = useCallback(() => {
    setFilters({
      status: '',
      priority: '',
      search: '',
    });
    setPage(0);
  }, []);

  /**
   * Refresh data (tickets and stats)
   */
  const handleRefresh = useCallback(async () => {
    await Promise.all([fetchTickets(), fetchTicketStats()]);
  }, [fetchTickets, fetchTicketStats]);

  // A ticket sent from the Zendesk widget — reload so it shows up here.
  useEffect(() => {
    window.addEventListener(ZENDESK_TICKET_SUBMITTED, handleRefresh);
    return () => window.removeEventListener(ZENDESK_TICKET_SUBMITTED, handleRefresh);
  }, [handleRefresh]);

  return {
    // State
    tickets,
    loading,
    selectedTicket,
    ticketComments,
    dialogOpen,
    detailViewOpen,
    ticketStats,
    page,
    rowsPerPage,
    totalCount,
    sortBy,
    sortOrder,
    filters,

    // Actions
    handleOpenDialog,
    handleCloseDialog,
    handleCreateTicket,
    handleUpdateTicket,
    handleAddComment,
    handleOpenDetailView,
    handleCloseDetailView,
    handlePageChange,
    handleRowsPerPageChange,
    handleSortChange,
    handleFiltersChange,
    handleResetFilters,
    handleRefresh,
    fetchTickets,
    fetchTicketDetails,
  };
};

export default useTickets;
